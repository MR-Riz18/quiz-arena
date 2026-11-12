// Phase 4 tests: friends, invitations, admin (questions/users/config/audit),
// profile update, player search, and config-driven rating tiers.
// DB tests use mongodb-memory-server with graceful skip when unavailable.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-please-change';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const mongoose = require('mongoose');

const User = require('../models/User');
const Category = require('../models/Category');
const Question = require('../models/Question');
const Invitation = require('../models/Invitation');
const AuditLog = require('../models/AuditLog');
const Config = require('../models/Config');
const { signToken } = require('../middleware/auth');
const { getRatingConfig, tierForTiers, clearRatingConfigCache } = require('../services/ratings');

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

// Unique users per run (suites share one in-memory DB).
const uid = () => Math.random().toString(36).slice(2, 8);

async function makeUser({ role = 'player' } = {}) {
  const tag = uid();
  const u = new User({ username: `t4_${tag}`, email: `t4_${tag}@x.com`, role });
  u.password = 'Password123';
  await u.save();
  return u;
}

// Authenticated supertest client without touching the login endpoint —
// signs the session cookie directly so the login rate-limiter (10/15min,
// shared across the whole jest process) is never involved.
function loginAs(user) {
  const token = signToken(user);
  const api = {};
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
    api[m] = (url) => request(app)[m](url).set('Cookie', `token=${token}`);
  }
  return api;
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------
describe('friends', () => {
  maybe('full flow: request -> accept -> list -> remove', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agentA = await loginAs(a);
    const agentB = await loginAs(b);

    const reqRes = await agentA.post('/api/friends/request').send({ username: b.username });
    expect(reqRes.status).toBe(201);

    const incoming = await agentB.get('/api/friends/requests');
    expect(incoming.status).toBe(200);
    expect(incoming.body.data.requests).toHaveLength(1);
    const reqId = incoming.body.data.requests[0].id;

    const acc = await agentB.post(`/api/friends/requests/${reqId}/accept`);
    expect(acc.status).toBe(200);

    const list = await agentA.get('/api/friends');
    expect(list.status).toBe(200);
    expect(list.body.data.friends.map((f) => f.username)).toContain(b.username);
    expect(typeof list.body.data.friends[0].isOnline).toBe('boolean');

    const del = await agentA.delete(`/api/friends/${b._id.toString()}`);
    expect(del.status).toBe(200);
    const after = await agentA.get('/api/friends');
    expect(after.body.data.friends).toHaveLength(0);
  });

  maybe('request validation: self -> 400, unknown -> 404, duplicate -> 409', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agentA = await loginAs(a);

    const self = await agentA.post('/api/friends/request').send({ username: a.username });
    expect(self.status).toBe(400);

    const unknown = await agentA.post('/api/friends/request').send({ username: 'no_such_user_xyz' });
    expect(unknown.status).toBe(404);

    const first = await agentA.post('/api/friends/request').send({ username: b.username });
    expect(first.status).toBe(201);
    const dup = await agentA.post('/api/friends/request').send({ username: b.username });
    expect(dup.status).toBe(409);
  });

  maybe('declining removes the request', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agentA = await loginAs(a);
    const agentB = await loginAs(b);
    await agentA.post('/api/friends/request').send({ username: b.username });
    const incoming = await agentB.get('/api/friends/requests');
    const reqId = incoming.body.data.requests[0].id;
    const dec = await agentB.post(`/api/friends/requests/${reqId}/decline`);
    expect(dec.status).toBe(200);
    const again = await agentB.get('/api/friends/requests');
    expect(again.body.data.requests).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------
describe('invitations', () => {
  maybe('send -> accept joins the room and returns its code', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agentA = await loginAs(a);
    const agentB = await loginAs(b);

    const roomRes = await agentA.post('/api/rooms').send({ name: 'Invite Test Room' });
    expect(roomRes.status).toBe(201);
    const code = roomRes.body.data.code;

    const inv = await agentA.post('/api/invitations').send({ recipientUsername: b.username, roomCode: code });
    expect(inv.status).toBe(201);

    const pending = await agentB.get('/api/invitations');
    expect(pending.status).toBe(200);
    expect(pending.body.data.invitations).toHaveLength(1);
    const invId = pending.body.data.invitations[0].id;

    const acc = await agentB.post(`/api/invitations/${invId}/accept`);
    expect(acc.status).toBe(200);
    expect(acc.body.data.code).toBe(code);

    const room = await agentB.get(`/api/rooms/${code}`);
    expect(room.body.data.room.players.map((p) => p.userId)).toContain(b._id.toString());
  });

  maybe('expired invitation cannot be accepted', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agentA = await loginAs(a);
    const agentB = await loginAs(b);

    const roomRes = await agentA.post('/api/rooms').send({ name: 'Expiry Room' });
    const code = roomRes.body.data.code;
    const roomDoc = await require('../models/Room').findOne({ code });

    // Craft an already-expired invitation directly (TTL sweeper may not have run).
    const inv = await Invitation.create({
      sender: a._id,
      recipient: b._id,
      room: roomDoc._id,
      expiresAt: new Date(Date.now() - 1000),
    });

    const acc = await agentB.post(`/api/invitations/${inv._id.toString()}/accept`);
    expect([404, 410]).toContain(acc.status);
  });

  maybe('accept fails when the room filled up (409)', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const c = await makeUser();
    const agentA = await loginAs(a);
    const agentB = await loginAs(b);
    const agentC = await loginAs(c);

    const roomRes = await agentA
      .post('/api/rooms')
      .send({ name: 'Full Room', config: { maxPlayers: 2 } });
    const code = roomRes.body.data.code;

    // Invite goes out while there is still space…
    await agentA.post('/api/invitations').send({ recipientUsername: c.username, roomCode: code });
    // …then the room fills up.
    const joined = await agentB.post(`/api/rooms/${code}/join`);
    expect(joined.status).toBe(200);

    const pending = await agentC.get('/api/invitations');
    const invId = pending.body.data.invitations[0].id;
    const acc = await agentC.post(`/api/invitations/${invId}/accept`);
    expect(acc.status).toBe(409);
  });

  maybe('cannot invite a player who is already in the room', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agentA = await loginAs(a);
    const agentB = await loginAs(b);
    const roomRes = await agentA.post('/api/rooms').send({ name: 'Dup Invite Room' });
    const code = roomRes.body.data.code;
    await agentB.post(`/api/rooms/${code}/join`);
    const inv = await agentA.post('/api/invitations').send({ recipientUsername: b.username, roomCode: code });
    expect(inv.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Admin: auth guard, questions, users, config, audit
// ---------------------------------------------------------------------------
describe('admin', () => {
  maybe('players get 403 on admin routes', async () => {
    const p = await makeUser();
    const agent = await loginAs(p);
    for (const path of ['/api/admin/stats', '/api/admin/users', '/api/admin/questions', '/api/admin/config']) {
      const res = await agent.get(path);
      expect(res.status).toBe(403);
    }
  });

  maybe('question validation rejects 3 options with 400', async () => {
    const admin = await makeUser({ role: 'admin' });
    const agent = await loginAs(admin);
    const cat = await Category.create({ name: `Cat ${uid()}` });
    const res = await agent.post('/api/admin/questions').send({
      text: 'Bad question?',
      options: ['a', 'b', 'c'],
      correctIndex: 0,
      category: cat._id.toString(),
    });
    expect(res.status).toBe(400);
  });

  maybe('admin question create writes an audit log', async () => {
    const admin = await makeUser({ role: 'admin' });
    const agent = await loginAs(admin);
    const cat = await Category.create({ name: `Cat ${uid()}` });
    const res = await agent.post('/api/admin/questions').send({
      text: `Audited question ${uid()}?`,
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 2,
      explanation: 'because',
      category: cat._id.toString(),
      difficulty: 'easy',
    });
    expect(res.status).toBe(201);
    const qid = res.body.data.question.id;
    const entry = await AuditLog.findOne({ action: 'admin.questions.create', targetId: qid });
    expect(entry).not.toBeNull();
    expect(entry.actor.toString()).toBe(admin._id.toString());
  });

  maybe('admin cannot deactivate themselves', async () => {
    const admin = await makeUser({ role: 'admin' });
    const agent = await loginAs(admin);
    const res = await agent.patch(`/api/admin/users/${admin._id.toString()}`).send({ isActive: false });
    expect(res.status).toBe(403);
    const res2 = await agent.patch(`/api/admin/users/${admin._id.toString()}`).send({ role: 'player' });
    expect(res2.status).toBe(403);
  });

  maybe('admin can suspend another user (and it is audit-logged)', async () => {
    const admin = await makeUser({ role: 'admin' });
    const victim = await makeUser();
    const agent = await loginAs(admin);
    const res = await agent.patch(`/api/admin/users/${victim._id.toString()}`).send({ isActive: false });
    expect(res.status).toBe(200);
    const entry = await AuditLog.findOne({ action: 'admin.users.update', targetId: victim._id.toString() });
    expect(entry).not.toBeNull();
  });

  maybe('admin category delete is blocked when questions exist', async () => {
    const admin = await makeUser({ role: 'admin' });
    const agent = await loginAs(admin);
    const catRes = await agent.post('/api/admin/categories').send({ name: `Cat ${uid()}` });
    expect(catRes.status).toBe(201);
    const catId = catRes.body.data.category._id;
    await Question.create({
      text: 'x?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, category: catId,
    });
    const del = await agent.delete(`/api/admin/categories/${catId}`);
    expect(del.status).toBe(409);
  });

  maybe('config tier update is reflected by tierFor', async () => {
    const admin = await makeUser({ role: 'admin' });
    const agent = await loginAs(admin);
    const tiers = [
      { name: 'Rookie', min: 0 },
      { name: 'Pro', min: 1500 },
    ];
    const res = await agent.patch('/api/admin/config').send({ tiers, kFactor: 16 });
    expect(res.status).toBe(200);

    clearRatingConfigCache();
    const { tiers: effective, kFactor } = await getRatingConfig();
    expect(kFactor).toBe(16);
    expect(tierForTiers(1600, effective)).toBe('Pro');
    expect(tierForTiers(100, effective)).toBe('Rookie');

    // Invalid bands are rejected.
    const bad = await agent.patch('/api/admin/config').send({
      tiers: [
        { name: 'A', min: 0 },
        { name: 'B', min: 0 },
      ],
    });
    expect(bad.status).toBe(400);

    // Cleanup so other tests see defaults.
    await Config.deleteMany({ key: { $in: ['tiers', 'kFactor'] } });
    clearRatingConfigCache();
  });

  maybe('admin stats returns the dashboard shape', async () => {
    const admin = await makeUser({ role: 'admin' });
    const agent = await loginAs(admin);
    const res = await agent.get('/api/admin/stats');
    expect(res.status).toBe(200);
    const d = res.body.data;
    for (const k of ['totalUsers', 'activeMatches', 'completedMatches', 'totalQuestions', 'avgMatchDurationMin']) {
      expect(typeof d[k]).toBe('number');
    }
    expect(Array.isArray(d.signupsPerDay)).toBe(true);
    expect(d.signupsPerDay).toHaveLength(7);
    expect(Array.isArray(d.matchesPerDay)).toBe(true);
    expect(Array.isArray(d.popularCategories)).toBe(true);
    expect(typeof d.matchmaking.queuedNow).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Profile update + player search
// ---------------------------------------------------------------------------
describe('players', () => {
  maybe('PATCH /players/me updates username and avatar', async () => {
    const u = await makeUser();
    const agent = await loginAs(u);
    const res = await agent.patch('/api/players/me').send({ username: `new_${u.username}`.slice(0, 20), avatar: 'teal' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar).toBe('teal');

    const badAvatar = await agent.patch('/api/players/me').send({ avatar: 'hacker' });
    expect(badAvatar.status).toBe(400);

    const badName = await agent.patch('/api/players/me').send({ username: 'ab' });
    expect(badName.status).toBe(400);
  });

  maybe('username uniqueness is enforced on update', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agentA = await loginAs(a);
    const res = await agentA.patch('/api/players/me').send({ username: b.username });
    expect(res.status).toBe(409);
  });

  maybe('player search returns prefix matches without emails', async () => {
    const u = await makeUser();
    const agent = await loginAs(u);
    const prefix = u.username.slice(0, 5);
    const res = await agent.get('/api/players/search').query({ q: prefix });
    expect(res.status).toBe(200);
    expect(res.body.data.players.length).toBeGreaterThan(0);
    expect(res.body.data.players.length).toBeLessThanOrEqual(10);
    for (const p of res.body.data.players) {
      expect(p.email).toBeUndefined();
      expect(p.username.toLowerCase().startsWith(prefix.toLowerCase())).toBe(true);
    }
  });
});
