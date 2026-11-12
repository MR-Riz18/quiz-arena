// QuizArena match engine — the SERVER is authoritative over everything:
// question sequence, deadlines, answer correctness, scores, placements.
// Clients never receive correct answers before a question ends.
//
// The engine keeps authoritative live state in memory (Map<matchId, state>)
// and persists to MongoDB at question boundaries and on finalize.
// All DB writes go through the injectable `persist` object so unit tests
// can run the engine without a database.
//
// PHASE 2 additions:
// - Reconnect grace period (RECONNECT_GRACE_MS, default 60s, env-overridable,
//   or injectable via createMatchEngine({ graceMs })): a disconnected player
//   keeps their seat; on expiry they are marked abandoned and the match
//   continues (or is cancelled / forfeited per the abandonment policy below).
// - Abandonment policy:
//     * disconnect (socket drop)          -> 60s grace, then abandon
//     * intentional room:leave mid-match  -> immediate abandon, no grace
//     * all players abandoned/disconnected-> match cancelled ('all players left')
//     * 1 player left connected in a 2-player match -> forfeit finalize,
//       the connected player takes rank 1 regardless of score
// - rankDelta on every broadcast leaderboard row (prev rank -> new rank).

const { ApiError } = require('../utils/response');
const Room = require('../models/Room');
const Match = require('../models/Match');
const Question = require('../models/Question');
const User = require('../models/User');
const { applyMatchRatings } = require('./ratings'); // Phase 3: Elo + tiers

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

const SCORING = { base: 1000, speedBonus: 500, streakBonus: 100, streakCap: 500 };
// Phase 4: admin-editable scoring via the Config collection. getCached() is
// sync and never blocks — without a DB connection it returns the defaults.
const { getCached: getConfigCached } = require('./config');

// points = base + speed bonus (linear with time remaining, capped) +
// streak bonus (per consecutive correct answer before this one, capped).
// streakBefore = consecutive correct answers BEFORE this one.
// `scoring` defaults to the compiled constants; the live path passes the
// admin-configured values snapshot at match start.
function calculatePoints({ correct, timeMs, timeLimitMs, streakBefore, scoring = SCORING }) {
  if (!correct) return 0;
  const sc = scoring && typeof scoring === 'object' ? { ...SCORING, ...scoring } : SCORING;
  const clampedMs = Math.max(0, Math.min(timeMs, timeLimitMs));
  const timeRemaining = timeLimitMs - clampedMs;
  const speed = Math.round(sc.speedBonus * (timeRemaining / timeLimitMs));
  const streak = Math.min(sc.streakCap, sc.streakBonus * Math.max(0, streakBefore));
  return sc.base + speed + streak;
}

// Match state machine.
const TRANSITIONS = {
  waiting: ['countdown', 'cancelled'],
  countdown: ['inProgress', 'cancelled'],
  inProgress: ['questionEnded', 'cancelled'],
  questionEnded: ['inProgress', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function transition(state, to) {
  if (!canTransition(state.state, to)) {
    throw new ApiError(409, `Invalid match transition: ${state.state} -> ${to}`);
  }
  state.state = to;
}

const isWithinDeadline = (nowMs, deadline) => nowMs < deadline;

// Leaderboard sorted by score desc, tie-break avg answer time asc, then username.
// prevRanks (Map<userId, rank>) is the last BROADCAST leaderboard; rankDelta is
// positive when the player moved up. Defaults to 0 on first broadcast.
function buildLeaderboard(playersMap, scoresMap, prevRanks = new Map()) {
  const rows = [...playersMap.values()].map((p) => ({
    userId: p.userId,
    username: p.username,
    avatar: p.avatar,
    score: scoresMap.get(p.userId) || 0,
    correctCount: p.correctCount,
    streak: p.streak,
    avgTimeMs: p.answeredCount ? Math.round(p.totalTimeMs / p.answeredCount) : 0,
    connected: p.connected,
    abandoned: !!p.abandoned,
  }));
  rows.sort(
    (a, b) => b.score - a.score || a.avgTimeMs - b.avgTimeMs || a.username.localeCompare(b.username)
  );
  rows.forEach((r, i) => {
    r.rank = i + 1;
    const prev = prevRanks.get(r.userId);
    r.rankDelta = prev == null ? 0 : prev - r.rank;
  });
  return rows;
}

function scoresToObject(scoresMap) {
  return Object.fromEntries(scoresMap.entries());
}

// ---------------------------------------------------------------------------
// Default persistence (Mongoose). Overridable for tests.
// ---------------------------------------------------------------------------
const defaultPersist = {
  saveProgress: (matchId, patch) => Match.findByIdAndUpdate(matchId, patch).exec(),
  markAbandoned: (matchId, userId) =>
    Match.findByIdAndUpdate(matchId, { $addToSet: { abandonedPlayers: userId } }).exec(),
  finalize: async (matchId, { scoresObj, answers, placements, playerSnapshots, winners, forfeit = false, ratingChanges = [], playerStats = {} }) => {
    await Match.findByIdAndUpdate(matchId, {
      state: 'completed',
      scores: scoresObj,
      answers,
      placements,
      playerSnapshots,
      ratingChanges,
      forfeit,
      completedAt: new Date(),
    }).exec();
    const m = await Match.findById(matchId).select('room').lean();
    if (m && m.room) await Room.findByIdAndUpdate(m.room, { status: 'completed' }).exec();
    for (const p of playerSnapshots) {
      const uid = p.userId.toString();
      const won = winners.has(uid);
      const ps = playerStats[uid] || {};
      await User.findByIdAndUpdate(p.userId, {
        $inc: {
          'stats.matchesPlayed': 1,
          'stats.wins': won ? 1 : 0,
          'stats.losses': won ? 0 : 1,
          // Phase 3: answer-level stats for accuracy / avg-response leaderboards.
          'stats.correctAnswers': ps.correct || 0,
          'stats.totalAnswers': ps.answered || 0,
          'stats.totalResponseMs': ps.totalTimeMs || 0,
        },
      }).exec();
    }
  },
  loadMatch: (matchId) => Match.findById(matchId).lean(),
};

// ---------------------------------------------------------------------------
// Engine factory
// ---------------------------------------------------------------------------
function createMatchEngine({ io = null, persist = defaultPersist, graceMs } = {}) {
  const live = new Map(); // matchId -> live state (internal; exposed for tests)
  const ioRef = { current: io };
  const GRACE_MS =
    graceMs != null ? Number(graceMs) : Number(process.env.RECONNECT_GRACE_MS) || 60000;
  // Phase 4: an explicitly injected graceMs (tests, explicit wiring) always
  // wins. Otherwise the admin-configured value (Config key reconnectGraceMs,
  // 60s cache) applies, falling back to the env/default above.
  const graceMsExplicit = graceMs != null;
  function currentGraceMs() {
    if (graceMsExplicit) return GRACE_MS;
    const cfg = getConfigCached().reconnectGraceMs;
    return Number.isFinite(cfg) && cfg > 0 ? cfg : GRACE_MS;
  }
  const graceTimers = new Map(); // `${matchId}:${userId}` -> timeout (unref'd)

  const emitRoom = (roomCode, event, payload) => {
    if (ioRef.current) ioRef.current.to(`room:${roomCode}`).emit(event, payload);
  };

  function setTimer(state, ms, fn) {
    clearTimer(state);
    state.timer = setTimeout(fn, ms);
    if (state.timer && typeof state.timer.unref === 'function') state.timer.unref();
  }
  function clearTimer(state) {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  const graceKey = (matchId, userId) => `${matchId}:${userId.toString()}`;

  function clearGraceTimer(matchId, userId) {
    const k = graceKey(matchId, userId);
    const t = graceTimers.get(k);
    if (t) {
      clearTimeout(t);
      graceTimers.delete(k);
    }
  }

  function clearGraceTimersForMatch(matchId) {
    for (const [k, t] of graceTimers) {
      if (k.startsWith(`${matchId}:`)) {
        clearTimeout(t);
        graceTimers.delete(k);
      }
    }
  }

  // Build a broadcast leaderboard and remember ranks for the next delta.
  function leaderboardFor(s) {
    const lb = buildLeaderboard(s.players, s.scores, s.prevRanks);
    s.prevRanks = new Map(lb.map((r) => [r.userId, r.rank]));
    return lb;
  }

  // Sample questions from the bank per room config.
  async function sampleQuestions(config) {
    const filter = { isActive: true };
    if (config.categoryId && config.categoryId !== 'mixed') filter.category = config.categoryId;
    if (config.difficulty && config.difficulty !== 'mixed') filter.difficulty = config.difficulty;
    const questions = await Question.aggregate([{ $match: filter }, { $sample: { size: config.questionCount } }]);
    if (questions.length < config.questionCount) {
      throw new ApiError(
        400,
        `Not enough questions in the bank (need ${config.questionCount}, found ${questions.length})`
      );
    }
    return questions;
  }

  // --- startMatch -----------------------------------------------------------
  async function startMatch(roomId, hostUserId) {
    const room = await Room.findById(roomId).populate('players.user', 'username avatar').populate('host', 'username');
    if (!room) throw new ApiError(404, 'Room not found');
    if (room.host._id.toString() !== hostUserId.toString()) throw new ApiError(403, 'Only the host can start the match');
    if (room.status !== 'waiting') throw new ApiError(409, 'Match has already started');
    if (room.players.length < 2) throw new ApiError(400, 'Need at least 2 players to start');
    const notReady = room.players.filter((p) => !p.ready);
    if (notReady.length > 0) throw new ApiError(400, 'All players must be ready');

    const questions = await sampleQuestions(room.config);

    const matchDoc = await Match.create({
      room: room._id,
      code: room.code,
      players: room.players.map((p) => p.user._id),
      // Phase 3: rooms created with config.rated=true (matchmaking competitive)
      // produce competitive, rated matches. Ordinary rooms stay casual/unrated.
      mode: room.config.rated ? 'competitive' : 'casual',
      rated: !!room.config.rated,
      categoryId: room.config.categoryId || 'mixed',
      questionIds: questions.map((q) => q._id),
      state: 'countdown',
      config: {
        timePerQuestion: room.config.timePerQuestion,
        questionCount: room.config.questionCount,
      },
      startedAt: new Date(),
    });

    const matchId = matchDoc._id.toString();
    const players = new Map();
    for (const p of room.players) {
      const u = p.user;
      players.set(u._id.toString(), {
        userId: u._id.toString(),
        username: u.username,
        avatar: u.avatar,
        connected: true,
        abandoned: false,
        streak: 0,
        correctCount: 0,
        totalTimeMs: 0,
        answeredCount: 0,
      });
    }

    live.set(matchId, {
      matchId,
      roomId: room._id.toString(),
      roomCode: room.code,
      state: 'countdown',
      rated: !!room.config.rated, // Phase 3: drives Elo application at finalize
      scoring: getConfigCached().scoring, // Phase 4: admin-configured scoring snapshot
      questions,
      currentIndex: -1,
      config: { timePerQuestion: room.config.timePerQuestion, questionCount: room.config.questionCount },
      players,
      answered: new Set(),
      answers: [],
      scores: new Map([...players.keys()].map((id) => [id, 0])),
      prevRanks: new Map(),
      timer: null,
    });

    room.status = 'inProgress';
    await room.save();

    const startsInMs = 3000;
    emitRoom(room.code, 'match:countdown', { matchId, startsInMs });
    emitRoom(room.code, 'match:started', {
      matchId,
      roomCode: room.code,
      totalQuestions: questions.length,
      players: [...players.values()].map((p) => ({ userId: p.userId, username: p.username, avatar: p.avatar })),
    });

    const st = live.get(matchId);
    setTimer(st, startsInMs, () => beginQuestion(matchId, 0));
    return { matchId };
  }

  // --- question lifecycle ----------------------------------------------------
  function beginQuestion(matchId, index) {
    const s = live.get(matchId);
    if (!s || s.state === 'completed' || s.state === 'cancelled') return;
    transition(s, 'inProgress');
    s.currentIndex = index;
    s.serverStart = Date.now();
    s.deadline = s.serverStart + s.config.timePerQuestion * 1000;
    s.answered = new Set();

    const q = s.questions[index];
    persist.saveProgress(matchId, { state: 'inProgress', currentIndex: index }).catch(() => {});

    emitRoom(s.roomCode, 'question:started', {
      matchId,
      questionIndex: index,
      totalQuestions: s.questions.length,
      questionId: q._id.toString(),
      text: q.text,
      options: q.options, // correctIndex NEVER sent here
      difficulty: q.difficulty,
      deadline: s.deadline,
      serverStart: s.serverStart,
    });

    setTimer(s, s.config.timePerQuestion * 1000, () => endQuestion(matchId));
  }

  // Returns an ack object for the private answer:received event.
  function submitAnswer(matchId, userId, optionIndex, nowMs = Date.now()) {
    const s = live.get(matchId);
    if (!s) return { accepted: false, reason: 'match-not-live' };
    const uid = userId.toString();
    const player = s.players.get(uid);
    if (!player) return { accepted: false, reason: 'not-a-player' };
    if (s.state !== 'inProgress') return { accepted: false, reason: 'not-accepting-answers' };
    if (!isWithinDeadline(nowMs, s.deadline)) return { accepted: false, reason: 'deadline-passed' };
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) {
      return { accepted: false, reason: 'invalid-option' };
    }
    const key = `${s.currentIndex}:${uid}`;
    if (s.answered.has(key)) return { accepted: false, reason: 'duplicate', duplicate: true };

    const q = s.questions[s.currentIndex];
    const correct = optionIndex === q.correctIndex;
    const timeMs = nowMs - s.serverStart;
    const streakBefore = player.streak;
    const points = calculatePoints({
      correct,
      timeMs,
      timeLimitMs: s.config.timePerQuestion * 1000,
      streakBefore,
      scoring: s.scoring,
    });

    player.streak = correct ? streakBefore + 1 : 0;
    player.correctCount += correct ? 1 : 0;
    player.totalTimeMs += timeMs;
    player.answeredCount += 1;
    s.scores.set(uid, (s.scores.get(uid) || 0) + points);
    s.answered.add(key);
    s.answers.push({
      questionIndex: s.currentIndex,
      userId: uid,
      optionIndex,
      correct,
      timeMs,
      points,
      at: new Date(nowMs),
    });

    const leaderboard = leaderboardFor(s);
    emitRoom(s.roomCode, 'score:updated', { matchId, scores: scoresToObject(s.scores) });
    emitRoom(s.roomCode, 'leaderboard:updated', { matchId, leaderboard });

    // End early once every CONNECTED player has answered.
    const connectedIds = [...s.players.values()].filter((p) => p.connected).map((p) => p.userId);
    const allAnswered = connectedIds.every((id) => s.answered.has(`${s.currentIndex}:${id}`));
    if (allAnswered) {
      setImmediate(() => endQuestion(matchId));
    }

    return { accepted: true, correct, points, timeMs, streak: player.streak };
  }

  function endQuestion(matchId) {
    const s = live.get(matchId);
    if (!s || s.state !== 'inProgress') return; // already ended / finalized
    transition(s, 'questionEnded');

    const q = s.questions[s.currentIndex];
    const leaderboard = leaderboardFor(s);
    persist
      .saveProgress(matchId, { state: 'questionEnded', scores: scoresToObject(s.scores) })
      .catch(() => {});

    emitRoom(s.roomCode, 'question:ended', {
      matchId,
      questionIndex: s.currentIndex,
      correctIndex: q.correctIndex, // reveal happens ONLY here
      explanation: q.explanation,
      scores: scoresToObject(s.scores),
      leaderboard,
    });

    const isLast = s.currentIndex >= s.questions.length - 1;
    setTimer(s, 4000, () => {
      // Phase 3: finalize may return a promise (rated matches) or a plain
      // value (casual) — normalize before catching.
      if (isLast) Promise.resolve(finalize(matchId)).catch(() => {});
      else beginQuestion(matchId, s.currentIndex + 1);
    });
  }

  function buildPlayerSnapshots(s) {
    return [...s.players.values()].map((p) => ({
      userId: p.userId,
      username: p.username,
      avatar: p.avatar,
      abandoned: !!p.abandoned,
    }));
  }

  function buildPlayerStats(s) {
    const playerStats = {};
    for (const p of s.players.values()) {
      playerStats[p.userId] = {
        correct: p.correctCount,
        answered: p.answeredCount,
        accuracy: p.answeredCount ? Math.round((p.correctCount / p.answeredCount) * 100) : 0,
        avgTimeMs: p.answeredCount ? Math.round(p.totalTimeMs / p.answeredCount) : 0,
        totalTimeMs: p.totalTimeMs, // Phase 3: denormalized into user.stats
      };
    }
    return playerStats;
  }

  // Phase 3: finalize computes Elo rating changes for competitive matches.
  // The double-finalize guard runs synchronously first. When no ratings are
  // involved the whole path stays synchronous (fast path); rated matches
  // return a promise that resolves with { placements, ratingChanges }.
  function finalize(matchId) {
    const s = live.get(matchId);
    if (!s || s.state === 'completed' || s.state === 'cancelled') return; // double-finalize guard
    clearTimer(s);
    clearGraceTimersForMatch(matchId);
    transition(s, 'completed');

    const leaderboard = leaderboardFor(s);
    const placements = leaderboard.map((r) => ({
      userId: r.userId,
      username: r.username,
      avatar: r.avatar,
      rank: r.rank,
      score: r.score,
      abandoned: r.abandoned,
    }));
    const winners = new Set(placements.filter((p) => p.rank === 1).map((p) => p.userId.toString()));
    const playerSnapshots = buildPlayerSnapshots(s);
    const playerStats = buildPlayerStats(s);

    const answers = s.answers.map((a) => ({
      ...a,
      username: s.players.get(a.userId.toString())?.username,
    }));

    const finish = (ratingChanges) => {
      persist
        .finalize(matchId, {
          scoresObj: scoresToObject(s.scores),
          answers,
          placements,
          playerSnapshots,
          winners,
          forfeit: false,
          ratingChanges,
          playerStats,
        })
        .catch(() => {});

      emitRoom(s.roomCode, 'match:completed', {
        matchId,
        placements,
        scores: scoresToObject(s.scores),
        playerStats,
        ratingChanges,
        forfeit: false,
      });

      live.delete(matchId);
      return { placements, ratingChanges };
    };

    // Phase 3: Elo — competitive matches only. Casual matches get [].
    if (s.rated) {
      return applyMatchRatings({ placements, rated: true }).then(finish, () => finish([]));
    }
    return finish([]);
  }

  // Forfeit finalize: exactly one player remains connected (2-player match).
  // The connected player takes rank 1 regardless of score. Bypasses the
  // transition guard deliberately — this is an exceptional path, not the
  // normal question flow (inProgress -> completed is invalid there).
  // Phase 3: forfeit WINS count for Elo (the loser takes a loss) on rated
  // matches; unrated forfeits change nothing. Like finalize(), the unrated
  // path stays fully synchronous.
  function finalizeForfeit(matchId) {
    const s = live.get(matchId);
    if (!s || s.state === 'completed' || s.state === 'cancelled') return;
    clearTimer(s);
    clearGraceTimersForMatch(matchId);
    s.state = 'completed';

    const winner = [...s.players.values()].find((p) => p.connected && !p.abandoned);
    const rows = buildLeaderboard(s.players, s.scores, s.prevRanks);
    const ordered = winner
      ? [rows.find((r) => r.userId === winner.userId), ...rows.filter((r) => r.userId !== winner.userId)]
      : rows;
    ordered.forEach((r, i) => {
      const prev = s.prevRanks.get(r.userId);
      r.rankDelta = prev == null ? 0 : prev - (i + 1);
      r.rank = i + 1;
    });
    s.prevRanks = new Map(ordered.map((r) => [r.userId, r.rank]));

    const placements = ordered.map((r) => ({
      userId: r.userId,
      username: r.username,
      avatar: r.avatar,
      rank: r.rank,
      score: r.score,
      abandoned: r.abandoned,
    }));
    const winners = new Set(winner ? [winner.userId.toString()] : []);
    const playerSnapshots = buildPlayerSnapshots(s);
    const playerStats = buildPlayerStats(s);

    const answers = s.answers.map((a) => ({
      ...a,
      username: s.players.get(a.userId.toString())?.username,
    }));

    const finish = (ratingChanges) => {
      persist
        .finalize(matchId, {
          scoresObj: scoresToObject(s.scores),
          answers,
          placements,
          playerSnapshots,
          winners,
          forfeit: true,
          ratingChanges,
          playerStats,
        })
        .catch(() => {});

      emitRoom(s.roomCode, 'match:completed', {
        matchId,
        placements,
        scores: scoresToObject(s.scores),
        playerStats,
        ratingChanges,
        forfeit: true,
        winnerId: winner ? winner.userId : null,
      });

      live.delete(matchId);
      return { placements, forfeit: true, ratingChanges };
    };

    if (s.rated) {
      return applyMatchRatings({ placements, rated: true }).then(finish, () => finish([]));
    }
    return finish([]);
  }

  function cancelMatch(matchId, reason = 'cancelled') {
    const s = live.get(matchId);
    if (!s || s.state === 'completed' || s.state === 'cancelled') return;
    clearTimer(s);
    clearGraceTimersForMatch(matchId);
    transition(s, 'cancelled');
    persist.saveProgress(matchId, { state: 'cancelled' }).catch(() => {});
    emitRoom(s.roomCode, 'match:cancelled', { matchId, reason });
    live.delete(matchId);
  }

  // --- abandonment ------------------------------------------------------------
  // Marks a player abandoned (immediate): seat lost, remaining questions score 0
  // (automatic — disconnected players can't answer and are excluded from the
  // early-finish check), persisted on the Match doc, then the endgame rules run:
  //   0 connected players        -> match cancelled ('all players left')
  //   1 connected in a 2-player  -> forfeit finalize (connected player rank 1)
  //   otherwise                  -> match continues
  function abandonPlayer(matchId, userId) {
    const s = live.get(matchId);
    if (!s || s.state === 'completed' || s.state === 'cancelled') return { abandoned: false };
    const uid = userId.toString();
    const p = s.players.get(uid);
    if (!p || p.abandoned) return { abandoned: false };

    clearGraceTimer(matchId, uid);
    p.abandoned = true;
    p.connected = false;
    persist.markAbandoned(matchId, uid).catch(() => {});
    emitRoom(s.roomCode, 'player:abandoned', { userId: uid, username: p.username });

    const connectedCount = [...s.players.values()].filter((x) => x.connected && !x.abandoned).length;
    if (connectedCount === 0) {
      cancelMatch(matchId, 'all players left');
      return { abandoned: true, outcome: 'cancelled' };
    }
    if (connectedCount === 1 && s.players.size === 2) {
      finalizeForfeit(matchId);
      return { abandoned: true, outcome: 'forfeit' };
    }
    // Match continues — push an updated leaderboard so badges refresh now.
    emitRoom(s.roomCode, 'leaderboard:updated', { matchId, leaderboard: leaderboardFor(s) });
    return { abandoned: true, outcome: 'continued' };
  }

  // Intentional leave (socket room:leave) during a live match = immediate abandon.
  function abandonOnRoomLeave(userId, roomCode) {
    const uid = userId.toString();
    const code = String(roomCode || '').toUpperCase();
    for (const s of live.values()) {
      if (s.roomCode === code && s.players.has(uid)) {
        return abandonPlayer(s.matchId, uid);
      }
    }
    return { abandoned: false };
  }

  // --- reconnect snapshot -----------------------------------------------------
  // Returns null when the requester is not a participant.
  async function getSnapshot(matchId, userId) {
    const uid = userId.toString();
    const s = live.get(matchId);
    if (s) {
      const player = s.players.get(uid);
      if (!player) return null;
      const now = Date.now();
      const snapshot = {
        matchId,
        state: s.state,
        roomCode: s.roomCode,
        questionIndex: s.currentIndex,
        totalQuestions: s.questions.length,
        scores: scoresToObject(s.scores),
        leaderboard: buildLeaderboard(s.players, s.scores, s.prevRanks),
        currentQuestion: null,
        lastReveal: null,
      };
      if (s.state === 'inProgress' && s.currentIndex >= 0) {
        const q = s.questions[s.currentIndex];
        snapshot.currentQuestion = {
          questionIndex: s.currentIndex,
          text: q.text,
          options: q.options,
          difficulty: q.difficulty,
          deadline: s.deadline,
          serverStart: s.serverStart,
          remainingMs: Math.max(0, s.deadline - now),
          alreadyAnswered: s.answered.has(`${s.currentIndex}:${uid}`),
        };
      }
      if (s.state === 'questionEnded' && s.currentIndex >= 0) {
        const q = s.questions[s.currentIndex];
        snapshot.lastReveal = {
          questionIndex: s.currentIndex,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        };
      }
      return snapshot;
    }
    // Not live — maybe already completed.
    const doc = await persist.loadMatch(matchId);
    if (!doc) return null;
    const isParticipant = (doc.players || []).some((p) => p.toString() === uid);
    if (!isParticipant) return null;
    return {
      matchId,
      state: doc.state,
      placements: doc.placements || [],
      scores: doc.scores || {},
    };
  }

  // --- presence -----------------------------------------------------------------
  // Phase 3: returns the live match id a user is currently playing in
  // (matchmaking uses this to reject queue joins mid-match).
  function getActiveMatchId(userId) {
    const uid = userId.toString();
    for (const [matchId, s] of live) {
      if (s.state !== 'completed' && s.state !== 'cancelled' && s.players.has(uid)) {
        return matchId;
      }
    }
    return null;
  }

  // Disconnect: flag the player, broadcast, and start the grace timer.
  // Reconnect inside the grace window cancels the timer — the seat is kept.
  function markDisconnected(userId) {
    const uid = userId.toString();
    for (const s of live.values()) {
      const p = s.players.get(uid);
      if (p && p.connected && !p.abandoned) {
        p.connected = false;
        emitRoom(s.roomCode, 'player:disconnected', { userId: uid, username: p.username });
        const k = graceKey(s.matchId, uid);
        clearGraceTimer(s.matchId, uid);
        const t = setTimeout(() => {
          graceTimers.delete(k);
          abandonPlayer(s.matchId, uid);
        }, currentGraceMs());
        if (typeof t.unref === 'function') t.unref();
        graceTimers.set(k, t);
      }
    }
  }

  function markReconnected(userId) {
    const uid = userId.toString();
    for (const s of live.values()) {
      const p = s.players.get(uid);
      if (!p || p.abandoned) continue;
      clearGraceTimer(s.matchId, uid);
      if (!p.connected) {
        p.connected = true;
        emitRoom(s.roomCode, 'player:reconnected', { userId: uid, username: p.username });
      }
    }
  }

  return {
    live, // exposed for tests (internal)
    setIO: (newIo) => {
      ioRef.current = newIo;
    },
    startMatch,
    submitAnswer,
    endQuestion,
    finalize,
    finalizeForfeit,
    cancelMatch,
    abandonPlayer,
    abandonOnRoomLeave,
    getSnapshot,
    markDisconnected,
    markReconnected,
    getActiveMatchId, // Phase 3: matchmaking active-match guard
    GRACE_MS,
    // pure helpers (unit-testable)
    calculatePoints,
    canTransition,
    TRANSITIONS,
    isWithinDeadline,
    buildLeaderboard,
    SCORING,
  };
}

module.exports = { createMatchEngine };
