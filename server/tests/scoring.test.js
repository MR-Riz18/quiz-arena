// Unit tests for the scoring formula — no DB required.
const { createMatchEngine } = require('../services/matchEngine');

const engine = createMatchEngine({ io: null });
const { calculatePoints } = engine;

describe('calculatePoints', () => {
  const T = 15000; // 15s time limit

  test('instant correct answer with no streak = 1500', () => {
    expect(calculatePoints({ correct: true, timeMs: 0, timeLimitMs: T, streakBefore: 0 })).toBe(1500);
  });

  test('correct at half time = 1000 + 250 speed bonus', () => {
    expect(calculatePoints({ correct: true, timeMs: 7500, timeLimitMs: T, streakBefore: 0 })).toBe(1250);
  });

  test('correct at the deadline = base only', () => {
    expect(calculatePoints({ correct: true, timeMs: T, timeLimitMs: T, streakBefore: 0 })).toBe(1000);
  });

  test('streak bonus: 100 per streak, capped at 500', () => {
    expect(calculatePoints({ correct: true, timeMs: 0, timeLimitMs: T, streakBefore: 2 })).toBe(1700);
    expect(calculatePoints({ correct: true, timeMs: 0, timeLimitMs: T, streakBefore: 5 })).toBe(2000);
    expect(calculatePoints({ correct: true, timeMs: 0, timeLimitMs: T, streakBefore: 10 })).toBe(2000);
  });

  test('wrong answer always scores 0', () => {
    expect(calculatePoints({ correct: false, timeMs: 0, timeLimitMs: T, streakBefore: 9 })).toBe(0);
  });

  test('negative streak is treated as 0', () => {
    expect(calculatePoints({ correct: true, timeMs: 0, timeLimitMs: T, streakBefore: -3 })).toBe(1500);
  });

  test('timeMs beyond the limit is clamped (never negative speed bonus)', () => {
    expect(calculatePoints({ correct: true, timeMs: 99999, timeLimitMs: T, streakBefore: 0 })).toBe(1000);
  });
});
