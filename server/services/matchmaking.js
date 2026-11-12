// QuizArena matchmaking service (Phase 3).
//
// In-memory FIFO queue of players looking for a quick match. The matcher runs
// on every join and on a 5s tick (unref'd). When two compatible players are
// found, a private "Quick Match" room is created for exactly those two and
// both are notified on their per-user socket rooms (`user:<userId>`) with
// `match:finished`... (see below: `match:found`). They then use the normal
// lobby flow (ready up, host starts).
//
// MATCHING RULES:
// - Same mode only (competitive vs casual never mix).
// - Category overlap: equal categories, or either side chose 'mixed'.
// - Rating proximity: |Ra - Rb| <= range, where each entry's range grows with
//   wait time: range = min(500, 100 + 100 * floor(waitedSec / 10)).
//   A pair matches when the gap is within the LARGER of the two ranges — the
//   longer-waiting player is willing to play a wider field.
// - Greedy FIFO: the longest-waiting unmatched entry pairs with the first
//   compatible entry behind it.

const { ApiError } = require('../utils/response');
const Room = require('../models/Room');
const Category = require('../models/Category');

const MATCH_MODES = ['competitive', 'casual'];
const TICK_MS = 5000;
const BASE_RANGE = 100;
const RANGE_STEP = 100; // per 10s waited
const MAX_RANGE = 500;

function createMatchmaker({ engine }) {
  const queue = []; // [{ userId, username, avatar, rating, mode, category, joinedAt }]
  const ioRef = { current: null };

  function setIO(io) {
    ioRef.current = io;
  }

  const findEntry = (userId) => queue.find((e) => e.userId === String(userId));

  // How wide this entry's rating net is right now.
  function rangeFor(entry, now = Date.now()) {
    const waitedSec = Math.max(0, Math.floor((now - entry.joinedAt) / 1000));
    return Math.min(MAX_RANGE, BASE_RANGE + RANGE_STEP * Math.floor(waitedSec / 10));
  }

  function categoriesOverlap(a, b) {
    return a === b || a === 'mixed' || b === 'mixed';
  }

  function compatible(a, b, now = Date.now()) {
    if (a.mode !== b.mode) return false;
    if (!categoriesOverlap(a.category, b.category)) return false;
    const gap = Math.abs(a.rating - b.rating);
    return gap <= Math.max(rangeFor(a, now), rangeFor(b, now));
  }

  // The category both players agreed on: the specific one if either chose it.
  function agreedCategory(a, b) {
    if (a.category === b.category) return a.category;
    if (a.category === 'mixed') return b.category;
    return a.category; // b is 'mixed' here (overlap already checked)
  }

  async function validateCategory(category) {
    const cat = String(category || 'mixed');
    if (cat === 'mixed') return 'mixed';
    if (!/^[a-fA-F0-9]{24}$/.test(cat)) throw new ApiError(400, 'Invalid category');
    const exists = await Category.exists({ _id: cat, isActive: true });
    if (!exists) throw new ApiError(400, 'Unknown category');
    return cat;
  }

  // Join the queue. Throws 409 when already queued or in a live match.
  // Returns { position, matched } — matched=true means a partner was found
  // immediately and this entry already left the queue.
  async function join({ userId, username, avatar, rating, mode = 'competitive', category = 'mixed' }) {
    const uid = String(userId);
    if (findEntry(uid)) throw new ApiError(409, 'Already in the matchmaking queue');
    if (engine && typeof engine.getActiveMatchId === 'function' && engine.getActiveMatchId(uid)) {
      throw new ApiError(409, 'You are already in an active match');
    }
    const cleanMode = MATCH_MODES.includes(mode) ? mode : 'competitive';
    const cleanCategory = await validateCategory(category);

    const entry = {
      userId: uid,
      username,
      avatar,
      rating: Number.isFinite(Number(rating)) ? Number(rating) : 1000,
      mode: cleanMode,
      category: cleanCategory,
      joinedAt: Date.now(),
    };
    queue.push(entry);
    await runMatcher();
    const stillQueued = findEntry(uid);
    return { position: stillQueued ? queue.indexOf(stillQueued) + 1 : 0, matched: !stillQueued };
  }

  // Remove from the queue. Returns true when an entry was removed.
  function leave(userId) {
    const idx = queue.findIndex((e) => e.userId === String(userId));
    if (idx === -1) return false;
    queue.splice(idx, 1);
    return true;
  }

  function status(userId) {
    const entry = findEntry(userId);
    if (!entry) return { inQueue: false, position: 0 };
    return { inQueue: true, position: queue.indexOf(entry) + 1, mode: entry.mode, category: entry.category };
  }

  async function createQuickMatch(a, b) {
    const category = agreedCategory(a, b);
    const rated = a.mode === 'competitive';
    const code = await Room.generateUniqueCode();
    const room = await Room.create({
      code,
      name: 'Quick Match',
      host: a.userId, // first-matched player hosts
      visibility: 'private',
      config: {
        maxPlayers: 2,
        categoryId: category,
        difficulty: 'mixed',
        questionCount: 5,
        timePerQuestion: 15,
        rated,
      },
      players: [
        { user: a.userId, ready: false, connected: true },
        { user: b.userId, ready: false, connected: true },
      ],
    });

    const io = ioRef.current;
    if (io) {
      const payload = { roomCode: code, mode: a.mode };
      io.to(`user:${a.userId}`).emit('match:found', payload);
      io.to(`user:${b.userId}`).emit('match:found', payload);
    }
    return room;
  }

  // Greedy FIFO pairing. Single-threaded: splice is atomic wrt the tick.
  async function runMatcher(now = Date.now()) {
    let i = 0;
    while (i < queue.length) {
      const a = queue[i];
      let partnerIdx = -1;
      for (let j = i + 1; j < queue.length; j++) {
        if (compatible(a, queue[j], now)) {
          partnerIdx = j;
          break;
        }
      }
      if (partnerIdx === -1) {
        i += 1;
        continue;
      }
      const b = queue[partnerIdx];
      queue.splice(partnerIdx, 1); // remove higher index first
      queue.splice(i, 1);
      await createQuickMatch(a, b);
      // don't advance i — the next entry shifted into this slot
    }
  }

  const timer = setInterval(() => {
    runMatcher().catch(() => {});
  }, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    join,
    leave,
    status,
    runMatcher,
    createQuickMatch,
    setIO,
    rangeFor, // exposed for tests/docs
    stop: () => clearInterval(timer),
    _queue: queue, // exposed for tests
  };
}

module.exports = { createMatchmaker, MATCH_MODES };
