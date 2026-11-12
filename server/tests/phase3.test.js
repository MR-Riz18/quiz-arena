// Phase 3 tests: Elo ratings, tiers, matchmaking, leaderboards, history.
// Pure rating math runs without a DB; DB tests use mongodb-memory-server
// with graceful skip when unavailable (same pattern as api.test.js).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecretphase3';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const mongoose = require('mongoose');

const {
  ELO_K,
  tierForRating,
  expectedScore,
  computeRatingDeltas,
  applyMatchRatings,
} = require('../services/ratings');
const { createMatchmaker } = require('../services/matchmaking');
const { createMatchEngine } = require('../services/matchEngine');
const User = require('../models/User');
const Room = require('../models/Room');
const Match = require('../models/Match');

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
const maybe = (name, fn) =>
  test(name, async () => {
    if (!dbUp()) {
      console.warn(`  (skipped, no DB) ${name}`);
      return;
    }
    await fn();
  });

// ---------------------------------------------------------------------------
// Pure Elo math (no DB)
// ---------------------------------------------------------------------------
describe('elo math', () => {
  test('favorite beating underdog gains little', () => {
    const [fav] = computeRatingDeltas([
      { userId: 'a', rating: 1600, rank: 1 },
      { userId: 'b', rating: 1000, rank: 2 },
    ]);
    expect(fav.delta).toBeGreaterThan(0);
    expect(fav.delta).toBeLessThanOrEqual(2);
  });

  test('underdog upset gains a lot', () => {
    const deltas = computeRatingDeltas([
      { userId: 'a', rating: 1600, rank: 2 },
      { userId: 'b', rating: 1000, rank: 1 },
    ]);
    const underdog = deltas.find((d) => d.userId === 'b');
    expect(underdog.delta).toBeGreaterThanOrEqual(25);
    // zero-sum for 2 players
    expect(deltas[0].delta + deltas[1].delta).toBe(0);
  });

  test('equal ratings: winner gains K/2', () => {
    const [w] = computeRatingDeltas([
      { userId: 'a', rating: 1200, rank: 1 },
      { userId: 'b', rating: 1200, rank: 2 },
    ]);
    expect(w.delta).toBe(Math.round(ELO_K / 2));
  });

  test('multiplayer deltas are approximately zero-sum', () => {
    const deltas = computeRatingDeltas([
      { userId: 'a', rating: 1500, rank: 1 },
      { userId: 'b', rating: 1200, rank: 2 },
      { userId: 'c', rating: 1000, rank: 3 },
      { userId: 'd', rating: 800, rank: 4 },
    ]);
    const sum = deltas.reduce((s, d) => s + d.delta, 0);
    expect(Math.abs(sum)).toBeLessThanOrEqual(4); // rounding only
    // winner gains rating, last place loses it
    const byUser = Object.fromEntries(deltas.map((d) => [d.userId, d.delta]));
    expect(byUser.a).toBeGreaterThan(0);
    expect(byUser.d).toBeLessThan(0);
  });

  test('expectedScore is the logistic curve', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 5);
    expect(expectedScore(1600, 1200)).toBeGreaterThan(0.9);
    expect(expectedScore(1200, 1600)).toBeLessThan(0.1);
  });
});

describe('tiers', () => {
  test('tier boundaries', () => {
    expect(tierForRating(0)).toBe('Bronze');
    expect(tierForRating(999)).toBe('Bronze');
    expect(tierForRating(1000)).toBe('Silver');
    expect(tierForRating(1199)).toBe('Silver');
    expect(tierForRating(1200)).toBe('Gold');
    expect(tierForRating(1399)).toBe('Gold');
    expect(tierForRating(1400)).toBe('Platinum');
    expect(tierForRating(1599)).toBe('Platinum');
    expect(tierForRating(1600)).toBe('Diamond');
    expect(tierForRating(1799)).toBe('Diamond');
    expect(tierForRating(1800)).toBe('Master');
    expect(tierForRating(2400)).toBe('Master');
  });
});

// ---------------------------------------------------------------------------
// Helpers for DB tests
// ---------------------------------------------------------------------------
let userSeq = 0;
async function makeUser(overrides = {}) {
  userSeq += 1;
  const tag = `${userSeq}${String(Date.now() % 100000)}`.slice(0, 8);
  return User.create({
    username: `p3u${tag}`,
    email: `p3u${tag}@x.com`,
    password: 'Password123',
    rating: 1000,
    ...overrides,
  });
}

function craftLiveState(engine, { match, users, scores, rated }) {
  const matchId = match._id.toString();
  const players = new Map();
  for (const u of users) {
    const uid = u._id.toString();
    players.set(uid, {
      userId: uid,
      username: u.username,
      avatar: u.avatar,
      connected: true,
      abandoned: false,
      streak: 0,
      correctCount: 3,
      totalTimeMs: 9000,
      answeredCount: 5,
    });
  }
  engine.live.set(matchId, {
    matchId,
    roomId: match.room.toString(),
    roomCode: match.code,
    state: 'questionEnded',
    rated,
    questions: [],
    currentIndex: 0,
    config: { timePerQuestion: 15, questionCount: 5 },
    players,
    answered: new Set(),
    answers: [],
    scores: new Map(Object.entries(scores)),
    prevRanks: new Map(),
    timer: null,
  });
  return matchId;
}

async function makeRatedMatch(users, { rated, mode }) {  const room = await Room.create({
    code: await Room.generateUniqueCode(),
    name: 'elo test room',
    host: users[0]._id,
    visibility: 'private',
    config: { maxPlayers: 2, rated },
    players: users.map((u) => ({ user: u._id, ready: true, connected: true })),
  });
  return Match.create({
    room: room._id,
    code: room.code,
    players: users.map((u) => u._id),
    mode,
    rated,
    state: 'questionEnded',
    questionIds: [],
    config: { timePerQuestion: 15, questionCount: 5 },
    startedAt: new Date(Date.now() - 60000),
  });
}

// persist.finalize is fire-and-forget by design (broadcasts never wait on the
// DB), so tests poll until the match doc lands instead of racing it.
async function waitForPersistedMatch(matchId, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    const doc = await Match.findById(matchId).lean();
    if (doc && doc.state === 'completed') return doc;
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for persisted match');
    await new Promise((r) => setTimeout(r, 25));
  }
}

// persist.finalize writes the match doc BEFORE the per-user $inc updates, so
// tests must also wait for the user stats to land.
async function waitForUserStats(userId, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    const u = await User.findById(userId).lean();
    if (u && u.stats && u.stats.matchesPlayed >= 1) return u;
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for user stats');
    await new Promise((r) => setTimeout(r, 25));
  }
}

// ---------------------------------------------------------------------------
// Engine finalize + ratings (DB)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Engine finalize + ratings (DB)
// ---------------------------------------------------------------------------
describe('rated finalize', () => {
  maybe('rated match applies Elo once even on double finalize', async () => {
    const engine = createMatchEngine(); // default persist -> real models
    const u1 = await makeUser({ username: `fav${Date.now()}`, rating: 1200 });
    const u2 = await makeUser({ username: `dog${Date.now()}`, rating: 1000 });
    const match = await makeRatedMatch([u1, u2], { rated: true, mode: 'competitive' });
    const id1 = u1._id.toString();
    const id2 = u2._id.toString();
    const matchId = craftLiveState(engine, {
      match,
      users: [u1, u2],
      scores: { [id1]: 5200, [id2]: 2100 },
      rated: true,
    });

    await engine.finalize(matchId);
    await engine.finalize(matchId); // duplicate — must be a no-op

    const doc = await waitForPersistedMatch(matchId);
    const fresh1 = await waitForUserStats(u1._id);
    const fresh2 = await waitForUserStats(u2._id);
    // E(1200 vs 1000) ≈ 0.76 -> winner gains round(32*0.24) = 8
    expect(fresh1.rating).toBe(1208);
    expect(fresh2.rating).toBe(992);
    expect(fresh1.tier).toBe('Gold'); // crossed 1200
    expect(fresh2.tier).toBe('Bronze'); // dropped below 1000

    expect(doc.ratingChanges).toHaveLength(2);
    const rc1 = doc.ratingChanges.find((r) => r.userId.toString() === id1);
    expect(rc1.delta).toBe(8);
    expect(rc1.before).toBe(1200);
    expect(rc1.after).toBe(1208);
    expect(rc1.tierBefore).toBe('Gold');
    expect(rc1.tierAfter).toBe('Gold');
  });

  maybe('casual match applies no rating changes', async () => {
    const engine = createMatchEngine();
    const u1 = await makeUser({ rating: 1300 });
    const u2 = await makeUser({ rating: 1100 });
    const match = await makeRatedMatch([u1, u2], { rated: false, mode: 'casual' });
    const matchId = craftLiveState(engine, {
      match,
      users: [u1, u2],
      scores: { [u1._id.toString()]: 4000, [u2._id.toString()]: 1000 },
      rated: false,
    });

    await engine.finalize(matchId);

    const doc = await waitForPersistedMatch(matchId);
    const fresh1 = await waitForUserStats(u1._id);
    expect(fresh1.rating).toBe(1300);
    expect(doc.ratingChanges).toHaveLength(0);
    // stats still tracked
    expect(fresh1.stats.matchesPlayed).toBe(1);
    expect(fresh1.stats.correctAnswers).toBe(3);
    expect(fresh1.stats.totalAnswers).toBe(5);
  });

  maybe('forfeit win counts for Elo on rated matches', async () => {
    const engine = createMatchEngine();
    const u1 = await makeUser({ rating: 1000 });
    const u2 = await makeUser({ rating: 1000 });
    const match = await makeRatedMatch([u1, u2], { rated: true, mode: 'competitive' });
    const id1 = u1._id.toString();
    const id2 = u2._id.toString();
    const matchId = craftLiveState(engine, {
      match,
      users: [u1, u2],
      scores: { [id1]: 500, [id2]: 9000 }, // winner was LOSING on points
      rated: true,
    });
    // u2 abandons -> forfeit finalize, u1 takes rank 1
    const st = engine.live.get(matchId);
    st.players.get(id2).connected = false;
    st.players.get(id2).abandoned = true;

    await engine.finalizeForfeit(matchId);

    await waitForPersistedMatch(matchId);
    const fresh1 = await waitForUserStats(u1._id);
    const fresh2 = await waitForUserStats(u2._id);
    // equal ratings: winner +16, loser -16
    expect(fresh1.rating).toBe(1016);
    expect(fresh2.rating).toBe(984);
  });
});

// ---------------------------------------------------------------------------
// Matchmaking (DB for room creation; fake io for event capture)
// ---------------------------------------------------------------------------
describe('matchmaking', () => {
  let mm;
  const emitted = [];

  beforeEach(() => {
    emitted.length = 0;
    mm = createMatchmaker({ engine: null });
    mm.setIO({
      to: (room) => ({
        emit: (event, payload) => emitted.push({ room, event, payload }),
      }),
    });
  });

  afterEach(() => mm.stop());

  maybe('pairs two compatible players and notifies both', async () => {
    const a = await makeUser({ rating: 1000 });
    const b = await makeUser({ rating: 1050 });
    const r1 = await mm.join({ userId: a._id, username: a.username, rating: 1000, mode: 'competitive', category: 'mixed' });
    expect(r1.matched).toBe(false);
    const r2 = await mm.join({ userId: b._id, username: b.username, rating: 1050, mode: 'competitive', category: 'mixed' });
    expect(r2.matched).toBe(true);
    expect(mm._queue).toHaveLength(0);

    const found = emitted.filter((e) => e.event === 'match:found');
    expect(found).toHaveLength(2);
    expect(found[0].payload.roomCode).toBe(found[1].payload.roomCode);
    expect(found[0].payload.mode).toBe('competitive');
    const rooms = emitted.map((e) => e.room);
    expect(rooms).toContain(`user:${a._id}`);
    expect(rooms).toContain(`user:${b._id}`);

    const room = await Room.findOne({ code: found[0].payload.roomCode });
    expect(room).toBeTruthy();
    expect(room.visibility).toBe('private');
    expect(room.config.rated).toBe(true);
    expect(room.players).toHaveLength(2);
  });

  maybe('does not pair across modes or categories', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await mm.join({ userId: a._id, username: a.username, rating: 1000, mode: 'competitive', category: 'mixed' });
    await mm.join({ userId: b._id, username: b.username, rating: 1000, mode: 'casual', category: 'mixed' });
    expect(mm._queue).toHaveLength(2);
    expect(emitted.filter((e) => e.event === 'match:found')).toHaveLength(0);
  });

  maybe('rating range expands with wait time', async () => {
    const a = await makeUser({ rating: 1000 });
    const b = await makeUser({ rating: 1400 });
    await mm.join({ userId: a._id, username: a.username, rating: 1000, mode: 'competitive', category: 'mixed' });
    await mm.join({ userId: b._id, username: b.username, rating: 1400, mode: 'competitive', category: 'mixed' });
    expect(mm._queue).toHaveLength(2); // gap 400 > base range 100

    // Simulate a having waited 40s -> range = 100 + 100*4 = 500 >= 400
    mm._queue[0].joinedAt = Date.now() - 40000;
    await mm.runMatcher();
    expect(mm._queue).toHaveLength(0);
    expect(emitted.filter((e) => e.event === 'match:found')).toHaveLength(2);
  });

  maybe('double queue join throws 409', async () => {
    const a = await makeUser();
    await mm.join({ userId: a._id, username: a.username, rating: 1000 });
    await expect(
      mm.join({ userId: a._id, username: a.username, rating: 1000 })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  maybe('join while in a live match throws 409', async () => {
    const engineStub = { getActiveMatchId: () => 'someMatchId' };
    const mm2 = createMatchmaker({ engine: engineStub });
    const a = await makeUser();
    await expect(
      mm2.join({ userId: a._id, username: a.username, rating: 1000 })
    ).rejects.toMatchObject({ statusCode: 409 });
    mm2.stop();
  });

  maybe('cancel removes the entry', async () => {
    const a = await makeUser();
    await mm.join({ userId: a._id, username: a.username, rating: 1000 });
    expect(mm.leave(a._id)).toBe(true);
    expect(mm.leave(a._id)).toBe(false);
    expect(mm._queue).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Player endpoints: history + public profile (DB, via the real app)
// ---------------------------------------------------------------------------
describe('player endpoints', () => {
  const app = require('../server');

  maybe('history returns rows and profile hides email', async () => {
    const agent = request.agent(app);
    const uname = `hist${Date.now() % 100000}`;
    await agent
      .post('/api/auth/register')
      .send({ username: uname, email: `${uname}@x.com`, password: 'Password123' });
    const me = await agent.get('/api/auth/me');
    const myId = me.body.data.user.id;

    const opp = await makeUser({ rating: 900 });
    const room = await Room.create({
      code: await Room.generateUniqueCode(),
      name: 'hist room',
      host: myId,
      visibility: 'private',
      config: { maxPlayers: 2, rated: true },
      players: [{ user: myId, ready: true }, { user: opp._id, ready: true }],
    });
    const now = new Date();
    await Match.create({
      room: room._id,
      code: room.code,
      players: [myId, opp._id],
      playerSnapshots: [
        { userId: myId, username: uname, avatar: 'default' },
        { userId: opp._id, username: opp.username, avatar: 'default' },
      ],
      mode: 'competitive',
      rated: true,
      categoryId: 'mixed',
      state: 'completed',
      questionIds: [],
      scores: { [myId]: 3000, [opp._id.toString()]: 1500 },
      placements: [
        { userId: myId, username: uname, rank: 1, score: 3000 },
        { userId: opp._id, username: opp.username, rank: 2, score: 1500 },
      ],
      ratingChanges: [
        { userId: myId, before: 1000, after: 1016, delta: 16, tierBefore: 'Silver', tierAfter: 'Silver' },
      ],
      config: { timePerQuestion: 15, questionCount: 5 },
      startedAt: new Date(now - 120000),
      completedAt: now,
    });

    const hist = await agent.get('/api/players/me/matches');
    expect(hist.status).toBe(200);
    expect(hist.body.data.total).toBe(1);
    const row = hist.body.data.matches[0];
    expect(row.result).toBe('win');
    expect(row.ratingDelta).toBe(16);
    expect(row.opponents).toHaveLength(1);
    expect(row.opponents[0].username).toBe(opp.username);

    const winsOnly = await agent.get('/api/players/me/matches?result=win');
    expect(winsOnly.body.data.total).toBe(1);
    const lossesOnly = await agent.get('/api/players/me/matches?result=loss');
    expect(lossesOnly.body.data.total).toBe(0);

    const prof = await agent.get(`/api/players/${uname}`);
    expect(prof.status).toBe(200);
    expect(prof.body.data.profile.username).toBe(uname);
    expect(prof.body.data.profile.email).toBeUndefined();
    expect(prof.body.data.profile.recentMatches).toHaveLength(1);
    expect(prof.body.data.profile.favoriteCategories).toHaveLength(1);

    const missing = await agent.get('/api/players/no_such_user_xyz');
    expect(missing.status).toBe(404);
  });
});
describe('matchmaking REST', () => {
  const app = require('../server');

  maybe('join twice via REST -> 409; cancel -> removed', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ username: `mmrest${Date.now()}`, email: `mmrest${Date.now()}@x.com`, password: 'Password123' });

    const first = await agent.post('/api/matchmaking/join').send({ mode: 'casual', category: 'mixed' });
    expect(first.status).toBe(200);
    expect(first.body.data.matched).toBe(false);

    const dup = await agent.post('/api/matchmaking/join').send({ mode: 'casual' });
    expect(dup.status).toBe(409);

    const cancel = await agent.post('/api/matchmaking/cancel');
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.removed).toBe(true);

    const status = await agent.get('/api/matchmaking/status');
    expect(status.body.data.inQueue).toBe(false);
  });
});

describe('leaderboards', () => {
  const app = require('../server');

  maybe('rating board is ordered desc and includes me', async () => {
    const mk = async (name, rating) => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/register')
        .send({ username: name, email: `${name}@x.com`, password: 'Password123' });
      await User.updateOne({ username: name }, { $set: { rating } });
      return agent;
    };
    const low = `lb_low_${Date.now()}`;
    const high = `lb_high_${Date.now()}`;
    const meAgent = await mk(low, 900);
    await mk(high, 1500);

    const res = await meAgent.get('/api/leaderboards/rating?limit=50');
    expect(res.status).toBe(200);
    const rows = res.body.data.rows;
    const ratings = rows.map((r) => r.rating);
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
    expect(res.body.data.me).toBeTruthy();
    expect(res.body.data.me.username).toBe(low);
    expect(res.body.data.me.rank).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r).toHaveProperty('tier');
      expect(r).toHaveProperty('winRate');
    }
  });

  maybe('accuracy board requires 10 matches', async () => {
    const name = `acc_${Date.now()}`;
    await User.create({
      username: name,
      email: `${name}@x.com`,
      password: 'Password123',
      stats: { matchesPlayed: 5, correctAnswers: 50, totalAnswers: 50 },
    });
    const res = await request(require('../server')).get('/api/leaderboards/accuracy');
    expect(res.status).toBe(200);
    const names = res.body.data.rows.map((r) => r.username);
    expect(names).not.toContain(name);
  });
});
