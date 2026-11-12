// Unit tests for the match state machine — no DB required.
const { createMatchEngine } = require('../services/matchEngine');

const engine = createMatchEngine({ io: null });
const { canTransition, TRANSITIONS } = engine;

describe('match state machine', () => {
  test('documents every state', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual(
      ['waiting', 'countdown', 'inProgress', 'questionEnded', 'completed', 'cancelled'].sort()
    );
  });

  const valid = [
    ['waiting', 'countdown'],
    ['waiting', 'cancelled'],
    ['countdown', 'inProgress'],
    ['countdown', 'cancelled'],
    ['inProgress', 'questionEnded'],
    ['inProgress', 'cancelled'],
    ['questionEnded', 'inProgress'],
    ['questionEnded', 'completed'],
    ['questionEnded', 'cancelled'],
  ];
  test.each(valid)('valid transition: %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  const invalid = [
    ['waiting', 'inProgress'], // must go through countdown
    ['waiting', 'completed'],
    ['countdown', 'questionEnded'],
    ['inProgress', 'completed'], // must end the question first
    ['questionEnded', 'countdown'],
    ['completed', 'inProgress'], // terminal
    ['completed', 'cancelled'],
    ['cancelled', 'waiting'], // terminal
    ['inProgress', 'waiting'],
  ];
  test.each(invalid)('invalid transition: %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  test('unknown states have no transitions', () => {
    expect(canTransition('nope', 'waiting')).toBe(false);
    expect(canTransition('waiting', 'nope')).toBe(false);
  });
});
