import { describe, expect, test } from 'vitest';
import { DEFAULT_RULES, LESSONS, handValue, isBlackjack, makeLessonQuestion, settleHand } from '../src/engine';

function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Start here quizzes: every answer comes from the game engine', () => {
  const rng = seeded(5);

  test('hand values', () => {
    for (let i = 0; i < 300; i++) {
      const q = makeLessonQuestion('values', DEFAULT_RULES, rng);
      const v = handValue(q.player);
      expect(q.answer).toBe(v.total > 21 ? 'Bust' : String(v.total));
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });

  test('soft, hard or blackjack', () => {
    for (let i = 0; i < 300; i++) {
      const q = makeLessonQuestion('soft', DEFAULT_RULES, rng);
      const v = handValue(q.player);
      const expected = isBlackjack(q.player) ? 'Blackjack' : v.total > 21 ? 'Bust' : `${v.soft ? 'Soft' : 'Hard'} ${v.total}`;
      expect(q.answer).toBe(expected);
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });

  test('who wins: the answer is the settlement of those exact cards', () => {
    for (const rules of [DEFAULT_RULES, { ...DEFAULT_RULES, blackjackPays: 1.2 as const, hitSoft17: false }]) {
      for (let i = 0; i < 300; i++) {
        const q = makeLessonQuestion('outcomes', rules, rng);
        const s = settleHand(q.player, q.dealer!, 10, rules);
        expect(q.answer).toBe(s.net > 0 ? `Win ${s.net}` : s.net < 0 ? 'Lose 10' : 'Push');
        expect(q.options).toContain(q.answer);
        expect(handValue(q.dealer!).total).toBeGreaterThanOrEqual(17); // the dealer finished by the rules
      }
    }
  });

  test('actions: surrender is only asked about when the table offers it', () => {
    const noSur = { ...DEFAULT_RULES, surrender: 'none' as const };
    for (let i = 0; i < 100; i++) {
      const q = makeLessonQuestion('actions', noSur, rng);
      expect(q.prompt).not.toMatch(/Surrender/);
      expect(q.options).toContain(q.answer);
    }
  });

  test('lesson text follows the table rules', () => {
    const text = (rules: typeof DEFAULT_RULES) => LESSONS.flatMap((l) => l.body(rules)).join(' ');
    expect(text(DEFAULT_RULES)).toMatch(/3 to 2/);
    expect(text(DEFAULT_RULES)).toMatch(/H17/);
    expect(text({ ...DEFAULT_RULES, blackjackPays: 1.2, hitSoft17: false })).toMatch(/6 to 5.*1\.4%/);
    expect(text({ ...DEFAULT_RULES, hitSoft17: false })).toMatch(/S17/);
    expect(text({ ...DEFAULT_RULES, surrender: 'none' })).toMatch(/Surrender is not offered/);
    expect(text({ ...DEFAULT_RULES, dealerPeeks: false })).toMatch(/no hole card/);
  });
});
