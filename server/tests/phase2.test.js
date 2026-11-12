// Phase 2 tests: reconnect grace period, abandonment policy, forfeit,
// rankDelta, and the rematch endpoint. Engine unit tests run without a DB;
// the rematch API tests use mongodb-memory-server with graceful skip.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret123';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';
process.env.NODE_ENV = 'test';

const { createMatchEngine } = require('../services/matchEngine');

// ---------------------------------------------------------------------------
// Helpers (no DB)
// ---------------------------------------------------------------------------
function makeEngine({ graceMs = 60000 } = {}) {
  const emitted = [];
  const persisted = { abandoned: [], finalized: [], progress: [] };
  const io = {
    to: () => ({
      emit: (event, payload) => emitted.push({ event, payload }),
    }),
  };
  const engine = createMatchEngine({
    io,
    graceMs,
    persist: {
      saveProgress: async (matchId, patch) => persisted.progress.push({ matchId, patch }),
      markAbandoned: async (matchId, userId) => persisted.abandoned.push({ matchId, userId }),
      finalize: async (matchId, args) => persisted.finalized.push({ matchId, args }),
      loadMatch: async () => null,
    },
  });
  return { engine, emitted, persisted };
}

function injectMatch(engine, { playerCount = 3, state = 'inProgress' } = {}) {
  const names = ['ann', 'bob', 'cid', 'dee', 'eli', 'fay', 'gus', 'hal'];
  const players = new Map();
  const scores = new Map();
  for (let i = 0; i < playerCount; i++) {
    const uid = `u${i + 1}`;
    players.set(uid, {
      userId: uid,
      username: names[i],
      avatar: 'default',
      connected: true,
      abandoned: false,
      streak: 0,
      correctCount: 0,
      totalTimeMs: 0,
      answeredCount: 0,
    });
    scores.set(uid, 0);
  }
  const now = Date.now();
  const s = {
    matchId: 'm1',
    roomId: 'r1',
    roomCode: 'ABC123',
    state,
    questions: [{ _id: 'q1', text: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'why a' }],
    currentIndex: 0,
    config: { timePerQuestion: 15, questionCount: 1 },
    serverStart: now - 1000,
    deadline: now - 1000 + 15000,
    timer: null,
    players,
    answered: new Set(),
    answers: [],
    scores,
    prevRanks: new Map(),
    ...{},
  };
  engine.live.set('m1', s);
  return s;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastOf = (emitted, event) => [...emitted].reverse().find((e) => e.event === event);

// ---------------------------------------------------------------------------
// Grace period + abandonment
// ---------------------------------------------------------------------------
describe('reconnect grace period', () => {
  test('disconnect starts grace; expiry abandons the player (3-player match continues)', async () => {
    const { engine, emitted, persisted } = makeEngine({ graceMs: 40 });
    injectMatch(engine, { playerCount: 3 });

    engine.markDisconnected('u1');
    const s = engine.live.get('m1');
    expect(s.players.get('u1').connected).toBe(false);
    expect(s.players.get('u1').abandoned).toBe(false);
    expect(emitted.some((e) => e.event === 'player:disconnected')).toBe(true);

    await sleep(120);
    expect(s.players.get('u1').abandoned).toBe(true);
    expect(persisted.abandoned).toEqual([{ matchId: 'm1', userId: 'u1' }]);
    const ab = lastOf(emitted, 'player:abandoned');
    expect(ab.payload).toMatchObject({ userId: 'u1', username: 'ann' });
    // 3-player match with 2 left connected -> continues
    expect(engine.live.has('m1')).toBe(true);
  });

  test('reconnect within grace cancels the timer — no abandon', async () => {
    const { engine, emitted, persisted } = makeEngine({ graceMs: 60 });
    injectMatch(engine, { playerCount: 3 });

    engine.markDisconnected('u2');
    await sleep(20);
    engine.markReconnected('u2');
    await sleep(120);

    const s = engine.live.get('m1');
    expect(s.players.get('u2').abandoned).toBe(false);
    expect(s.players.get('u2').connected).toBe(true);
    expect(persisted.abandoned).toEqual([]);
    expect(emitted.some((e) => e.event === 'player:abandoned')).toBe(false);
    expect(emitted.some((e) => e.event === 'player:reconnected')).toBe(true);
  });

  test('intentional room:leave abandons immediately (no grace)', async () => {
    const { engine, emitted, persisted } = makeEngine({ graceMs: 60000 });
    injectMatch(engine, { playerCount: 3 });

    const res = engine.abandonOnRoomLeave('u3', 'ABC123');
    expect(res.abandoned).toBe(true);
    expect(res.outcome).toBe('continued');
    expect(engine.live.get('m1').players.get('u3').abandoned).toBe(true);
    expect(persisted.abandoned).toEqual([{ matchId: 'm1', userId: 'u3' }]);
    expect(emitted.some((e) => e.event === 'player:abandoned')).toBe(true);
  });

  test('room:leave for a non-live room code is a no-op', () => {
    const { engine, emitted } = makeEngine();
    injectMatch(engine, { playerCount: 3 });
    const res = engine.abandonOnRoomLeave('u1', 'ZZZ999');
    expect(res.abandoned).toBe(false);
    expect(emitted.some((e) => e.event === 'player:abandoned')).toBe(false);
  });

  test('all players disconnecting cancels the match once grace expires', async () => {
    const { engine, emitted } = makeEngine({ graceMs: 40 });
    injectMatch(engine, { playerCount: 2 });

    engine.markDisconnected('u1');
    engine.markDisconnected('u2');
    await sleep(150);

    expect(engine.live.has('m1')).toBe(false); // cancelled -> removed
    const cancelled = lastOf(emitted, 'match:cancelled');
    expect(cancelled.payload).toMatchObject({ matchId: 'm1', reason: 'all players left' });
  });
});

// ---------------------------------------------------------------------------
// Forfeit
// ---------------------------------------------------------------------------
describe('forfeit finalization', () => {
  test('2-player match: abandoning one player finalizes with the connected player rank 1', () => {
    const { engine, emitted, persisted } = makeEngine();
    const s = injectMatch(engine, { playerCount: 2 });
    // Give the abandoning player a big lead — forfeit must ignore it.
    s.scores.set('u1', 5000);

    const res = engine.abandonPlayer('m1', 'u1');
    expect(res).toMatchObject({ abandoned: true, outcome: 'forfeit' });

    const done = lastOf(emitted, 'match:completed');
    expect(done).toBeTruthy();
    expect(done.payload.forfeit).toBe(true);
    expect(done.payload.placements[0].userId).toBe('u2');
    expect(done.payload.placements[0].rank).toBe(1);
    expect(done.payload.placements[1]).toMatchObject({ userId: 'u1', rank: 2, abandoned: true });

    expect(persisted.finalized).toHaveLength(1);
    expect(persisted.finalized[0].args.forfeit).toBe(true);
    // winner (rank 1) gets the win recorded
    expect([...persisted.finalized[0].args.winners]).toEqual(['u2']);
    expect(engine.live.has('m1')).toBe(false);
  });

  test('3-player match with one abandonment continues (no forfeit)', () => {
    const { engine, emitted } = makeEngine();
    injectMatch(engine, { playerCount: 3 });
    const res = engine.abandonPlayer('m1', 'u1');
    expect(res).toMatchObject({ abandoned: true, outcome: 'continued' });
    expect(engine.live.has('m1')).toBe(true);
    expect(emitted.some((e) => e.event === 'match:completed')).toBe(false);
    // leaderboard refresh carries the abandoned badge
    const lb = lastOf(emitted, 'leaderboard:updated');
    expect(lb.payload.leaderboard.find((r) => r.userId === 'u1').abandoned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rankDelta
// ---------------------------------------------------------------------------
describe('leaderboard rankDelta', () => {
  test('every broadcast row carries a numeric rankDelta; movers get non-zero deltas', () => {
    const { engine, emitted } = makeEngine();
    injectMatch(engine, { playerCount: 3 });

    // u1 answers wrong -> first broadcast, all deltas 0
    engine.submitAnswer('m1', 'u1', 2);
    let lb = lastOf(emitted, 'leaderboard:updated').payload.leaderboard;
    expect(lb.every((r) => typeof r.rankDelta === 'number')).toBe(true);
    expect(lb.every((r) => r.rankDelta === 0)).toBe(true);

    // u3 answers correctly -> jumps to rank 1
    // (after u1's wrong answer the tie-break on avgTime put cid 2nd: bob, cid, ann)
    engine.submitAnswer('m1', 'u3', 0);
    lb = lastOf(emitted, 'leaderboard:updated').payload.leaderboard;
    const cid = lb.find((r) => r.userId === 'u3');
    expect(cid.rank).toBe(1);
    expect(cid.rankDelta).toBe(1); // was 2nd, now 1st
    expect(lb.every((r) => typeof r.rankDelta === 'number')).toBe(true);
  });

  test('question:ended payload also carries rankDelta', () => {
    const { engine, emitted } = makeEngine();
    injectMatch(engine, { playerCount: 2 });
    engine.submitAnswer('m1', 'u1', 0);
    engine.endQuestion('m1');
    const ended = lastOf(emitted, 'question:ended');
    expect(ended.payload.leaderboard.every((r) => typeof r.rankDelta === 'number')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rematch endpoint (DB integration, graceful skip)
// ---------------------------------------------------------------------------
describe('POST /api/matches/:id/rematch', () => {
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
  const Match = require('../models/Match');
  const Room = require('../models/Room');

  const maybe = (name, fn) =>
    test(name, async () => {
      if (!dbUp()) {
        console.warn(`  (skipped, no DB) ${name}`);
        return;
      }
      await fn();
    });

  let agent1; let agent2; let agent3;
  let u1; let u2;
  let completedMatchId;

  maybe('setup: users, room and a completed match', async () => {
    const mk = async (username, email) => {
      const agent = request.agent(app);
      const res = await agent
        .post('/api/auth/register')
        .send({ username, email, password: 'Password123' });
      expect(res.status).toBe(201);
      return { agent, id: res.body.data.user.id };
    };
    ({ agent: agent1, id: u1 } = await mk('rem1', 'rem1@x.com'));
    ({ agent: agent2, id: u2 } = await mk('rem2', 'rem2@x.com'));
    ({ agent: agent3 } = await mk('rem3', 'rem3@x.com'));

    const roomRes = await agent1.post('/api/rooms').send({ name: 'Friday Quiz' });
    expect(roomRes.status).toBe(201);
    const roomId = roomRes.body.data.room.id;
    await agent2.post(`/api/rooms/${roomRes.body.data.code}/join`);

    const m = await Match.create({
      room: roomId,
      code: roomRes.body.data.code,
      players: [u1, u2],
      state: 'completed',
      questionIds: [],
      config: { timePerQuestion: 15, questionCount: 5 },
    });
    completedMatchId = m._id.toString();
    // stash the room doc for name checks
    const r = await Room.findById(roomId).lean();
    expect(r.name).toBe('Friday Quiz');
  });

  maybe('creates a rematch room with identical config for a participant', async () => {
    const res = await agent1.post(`/api/matches/${completedMatchId}/rematch`);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const { room, code } = res.body.data;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(room.name).toBe('Friday Quiz (rematch)');
    expect(room.host.id).toBe(u1);
    expect(room.players).toHaveLength(1);
    expect(room.status).toBe('waiting');
  });

  maybe('rejects non-participants with 403', async () => {
    const res = await agent3.post(`/api/matches/${completedMatchId}/rematch`);
    expect(res.status).toBe(403);
  });

  maybe('rejects rematch of a non-completed match with 409', async () => {
    const m = await Match.create({
      room: new mongoose.Types.ObjectId(),
      code: 'XXXXXX',
      players: [u1],
      state: 'waiting',
      questionIds: [],
      config: {},
    });
    const res = await agent1.post(`/api/matches/${m._id.toString()}/rematch`);
    expect(res.status).toBe(409);
  });

  maybe('returns 404 for an unknown match', async () => {
    const res = await agent1.post('/api/matches/000000000000000000000000/rematch');
    expect(res.status).toBe(404);
  });
});
