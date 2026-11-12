// Unit tests for answer-submission rules (deadline, duplicates, validation)
// using an injected in-memory live state — no DB required.
const { createMatchEngine } = require('../services/matchEngine');

function makeEngine() {
  const emitted = [];
  const io = {
    to: () => ({
      emit: (event, payload) => emitted.push({ event, payload }),
    }),
  };
  const engine = createMatchEngine({
    io,
    persist: {
      saveProgress: async () => {},
      finalize: async () => {},
      loadMatch: async () => null,
    },
  });
  return { engine, emitted };
}

function injectMatch(engine, overrides = {}) {
  const players = new Map([
    ['u1', { userId: 'u1', username: 'ann', avatar: 'default', connected: true, streak: 2, correctCount: 3, totalTimeMs: 4000, answeredCount: 2 }],
    ['u2', { userId: 'u2', username: 'bob', avatar: 'default', connected: true, streak: 0, correctCount: 1, totalTimeMs: 6000, answeredCount: 2 }],
  ]);
  const now = Date.now();
  const state = {
    matchId: 'm1',
    roomId: 'r1',
    roomCode: 'ABC123',
    state: 'inProgress',
    questions: [{ _id: 'q1', text: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 1, explanation: 'why b' }],
    currentIndex: 0,
    config: { timePerQuestion: 15, questionCount: 1 },
    serverStart: now - 2000,
    deadline: now - 2000 + 15000,
    timer: null,
    players,
    answered: new Set(),
    answers: [],
    scores: new Map([['u1', 0], ['u2', 0]]),
    ...overrides,
  };
  engine.live.set('m1', state);
  return state;
}

describe('submitAnswer rules', () => {
  test('accepts a correct answer and scores it (streak 2 -> +200)', () => {
    const { engine, emitted } = makeEngine();
    injectMatch(engine);
    const res = engine.submitAnswer('m1', 'u1', 1);
    expect(res.accepted).toBe(true);
    expect(res.correct).toBe(true);
    // 1000 base + round(500 * 13000/15000)=433 + 200 streak = 1633
    expect(res.points).toBe(1633);
    expect(res.streak).toBe(3);
    expect(emitted.some((e) => e.event === 'score:updated')).toBe(true);
  });

  test('wrong answer scores 0 and resets streak', () => {
    const { engine } = makeEngine();
    injectMatch(engine);
    const res = engine.submitAnswer('m1', 'u1', 0);
    expect(res.accepted).toBe(true);
    expect(res.correct).toBe(false);
    expect(res.points).toBe(0);
    expect(res.streak).toBe(0);
  });

  test('duplicate answer for the same question is rejected', () => {
    const { engine } = makeEngine();
    injectMatch(engine);
    expect(engine.submitAnswer('m1', 'u1', 1).accepted).toBe(true);
    const dup = engine.submitAnswer('m1', 'u1', 2);
    expect(dup.accepted).toBe(false);
    expect(dup.reason).toBe('duplicate');
  });

  test('answer after the deadline is rejected', () => {
    const { engine } = makeEngine();
    const now = Date.now();
    injectMatch(engine, { serverStart: now - 20000, deadline: now - 5000 });
    const res = engine.submitAnswer('m1', 'u1', 1);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('deadline-passed');
  });

  test('invalid option index is rejected', () => {
    const { engine } = makeEngine();
    injectMatch(engine);
    for (const bad of [-1, 4, 1.5, 'x', null]) {
      expect(engine.submitAnswer('m1', 'u1', bad).reason).toBe('invalid-option');
    }
  });

  test('non-player is rejected', () => {
    const { engine } = makeEngine();
    injectMatch(engine);
    expect(engine.submitAnswer('m1', 'stranger', 1).reason).toBe('not-a-player');
  });

  test('answers rejected when question is not live', () => {
    const { engine } = makeEngine();
    injectMatch(engine, { state: 'questionEnded' });
    expect(engine.submitAnswer('m1', 'u1', 1).reason).toBe('not-accepting-answers');
  });

  test('unknown match id is rejected', () => {
    const { engine } = makeEngine();
    expect(engine.submitAnswer('nope', 'u1', 1).reason).toBe('match-not-live');
  });

  test('disconnected players are excluded from the early-finish check', () => {
    const { engine, emitted } = makeEngine();
    const state = injectMatch(engine);
    // u2 disconnects; u1 answering alone should end the question early.
    state.players.get('u2').connected = false;
    engine.submitAnswer('m1', 'u1', 1);
    return new Promise((resolve) => setImmediate(resolve)).then(() => {
      expect(emitted.some((e) => e.event === 'question:ended')).toBe(true);
    });
  });
});
