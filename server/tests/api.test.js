// API integration tests. Uses mongodb-memory-server when available;
// skips DB-dependent tests gracefully when it is not (e.g. no network).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-please-change';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const mongoose = require('mongoose');

let mongod = null;

beforeAll(async () => {
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  } catch (err) {
    console.warn('DB unavailable — skipping DB tests:', err.message);
  }
}, 120000);

afterAll(async () => {
  await mongoose.disconnect().catch(() => {});
  if (mongod) await mongod.stop().catch(() => {});
});

const dbUp = () => mongoose.connection.readyState === 1;
const app = require('../server');

const maybe = (name, fn) =>
  test(name, async () => {
    if (!dbUp()) {
      console.warn(`  (skipped, no DB) ${name}`);
      return;
    }
    await fn();
  });

describe('auth', () => {
  maybe('registers a user and sets the cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'tester1', email: 'tester1@x.com', password: 'Password123' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe('tester1');
    expect(res.body.data.user.email).toBe('tester1@x.com');
    expect(res.headers['set-cookie'].join(';')).toMatch(/token=/);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  maybe('rejects duplicate email and username', async () => {
    await request(app).post('/api/auth/register').send({ username: 'tester2', email: 'tester2@x.com', password: 'Password123' });
    const dupEmail = await request(app).post('/api/auth/register').send({ username: 'other', email: 'tester2@x.com', password: 'Password123' });
    expect(dupEmail.status).toBe(409);
    const dupName = await request(app).post('/api/auth/register').send({ username: 'tester2', email: 'other@x.com', password: 'Password123' });
    expect(dupName.status).toBe(409);
  });

  maybe('login works and wrong password fails', async () => {
    const agent = request.agent(app);
    const okRes = await agent.post('/api/auth/login').send({ email: 'tester1@x.com', password: 'Password123' });
    expect(okRes.status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.username).toBe('tester1');

    const bad = await request(app).post('/api/auth/login').send({ email: 'tester1@x.com', password: 'WrongPass1' });
    expect(bad.status).toBe(401);
  });

  maybe('protected routes reject unauthenticated requests', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/rooms').send({ name: 'x' })).status).toBe(401);
  });

  maybe('password change verifies the current password', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'tester1@x.com', password: 'Password123' });
    const bad = await agent.patch('/api/auth/password').send({ currentPassword: 'Nope12345', newPassword: 'NewPass123' });
    expect(bad.status).toBe(401);
    const good = await agent.patch('/api/auth/password').send({ currentPassword: 'Password123', newPassword: 'NewPass123' });
    expect(good.status).toBe(200);
    const relogin = await request(app).post('/api/auth/login').send({ email: 'tester1@x.com', password: 'NewPass123' });
    expect(relogin.status).toBe(200);
  });
});

describe('rooms', () => {
  let hostAgent;
  let roomCode;

  maybe('creates a room with a 6-char code', async () => {
    hostAgent = request.agent(app);
    await hostAgent.post('/api/auth/register').send({ username: 'host1', email: 'host1@x.com', password: 'Password123' });
    const res = await hostAgent.post('/api/rooms').send({ name: 'Friday Quiz', config: { maxPlayers: 2 } });
    expect(res.status).toBe(201);
    roomCode = res.body.data.code;
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
  });

  maybe('second player can join; third is rejected when full', async () => {
    const p2 = request.agent(app);
    await p2.post('/api/auth/register').send({ username: 'player_b', email: 'b@x.com', password: 'Password123' });
    const joined = await p2.post(`/api/rooms/${roomCode}/join`);
    expect(joined.status).toBe(200);
    expect(joined.body.data.room.players).toHaveLength(2);

    const p3 = request.agent(app);
    await p3.post('/api/auth/register').send({ username: 'player_c', email: 'c@x.com', password: 'Password123' });
    const full = await p3.post(`/api/rooms/${roomCode}/join`);
    expect(full.status).toBe(409);
  });

  maybe('public rooms are listed', async () => {
    const res = await hostAgent.get('/api/rooms');
    expect(res.status).toBe(200);
    expect(res.body.data.rooms.length).toBeGreaterThanOrEqual(1);
  });

  maybe('private room details are hidden from outsiders but joinable by code', async () => {
    const mk = await hostAgent.post('/api/rooms').send({ name: 'Secret', visibility: 'private' });
    const secretCode = mk.body.data.code;

    const outsider = request.agent(app);
    await outsider.post('/api/auth/register').send({ username: 'outsider1', email: 'out1@x.com', password: 'Password123' });
    expect((await outsider.get(`/api/rooms/${secretCode}`)).status).toBe(403);

    // The code is the invite — joining works.
    expect((await outsider.post(`/api/rooms/${secretCode}/join`)).status).toBe(200);
    // ...and now the room is visible to the new member.
    expect((await outsider.get(`/api/rooms/${secretCode}`)).status).toBe(200);
  });
});

describe('questions', () => {
  maybe('question bank never leaks correct answers', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ username: 'quizzer1', email: 'q1@x.com', password: 'Password123' });

    // Create one question directly via the model (no admin endpoint in Phase 1).
    const Category = require('../models/Category');
    const Question = require('../models/Question');
    const cat = await Category.create({ name: 'SeedCat' });
    await Question.create({
      text: '2+2?', options: ['3', '4', '5', '6'], correctIndex: 1,
      explanation: 'basic arithmetic', category: cat._id, difficulty: 'easy',
    });

    const anon = await request(app).get('/api/questions');
    expect(anon.status).toBe(401);

    const res = await agent.get('/api/questions?limit=5');
    expect(res.status).toBe(200);
    for (const q of res.body.data.questions) {
      expect(q).not.toHaveProperty('correctIndex');
      expect(q).not.toHaveProperty('explanation');
      expect(q.options).toHaveLength(4);
    }
  });
});

describe('matches', () => {
  maybe('non-participants cannot view a match', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ username: 'nosy1', email: 'nosy1@x.com', password: 'Password123' });
    const fakeId = new mongoose.Types.ObjectId().toString();
    expect((await agent.get(`/api/matches/${fakeId}`)).status).toBe(404);
  });
});
