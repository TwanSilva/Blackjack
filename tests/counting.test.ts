import { describe, expect, test } from 'vitest';
import {
  type Card, type Rank, CountTracker, DEFAULT_RULES, HI_LO, RANKS, SUITS, Shoe, buildCountSequence, buildDecks,
  countValue, deckChoices, deckSum, estimateDecks, explainTrueCount, gradeTrueCount, handValue, isBalanced,
  makeTrueCountQuestion, runningCount, scoreLearning, scoreTest, systemHint, trueCount,
} from '../src/engine';

const c = (rank: Rank): Card => ({ rank, suit: 'hearts' });

function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Section 9 of UX Blackjack.md.
describe('Hi-Lo values', () => {
  test('a 9 is 0, an Ace is −1, a 5 is +1', () => {
    expect(countValue(c('9'))).toBe(0);
    expect(countValue(c('A'))).toBe(-1);
    expect(countValue(c('5'))).toBe(1);
  });

  test('every rank: 2–6 are +1, 7–9 are 0, 10–A are −1', () => {
    const expected: Record<Rank, number> = {
      A: -1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 0, '8': 0, '9': 0, '10': -1, J: -1, Q: -1, K: -1,
    };
    for (const rank of RANKS) for (const suit of SUITS) expect(countValue({ rank, suit }), rank).toBe(expected[rank]);
  });

  test('a full 52-card deck sums to 0', () => {
    expect(runningCount(buildDecks(1))).toBe(0);
    expect(deckSum(HI_LO)).toBe(0);
    expect(isBalanced(HI_LO)).toBe(true);
  });

  test('a shuffled 8-deck shoe also ends at 0', () => {
    const shoe = new Shoe(8, 1, seeded(3));
    const t = new CountTracker(8);
    while (shoe.remaining > 0) t.see(shoe.draw());
    expect(t.running).toBe(0);
    expect(t.cardsRemaining).toBe(0);
  });

  test('the hint is generated from the table', () => {
    expect(systemHint(HI_LO)).toBe('2–6 are +1, 7–9 are 0, 10–A are −1.');
  });
});

describe('true count', () => {
  test('running count divided by decks remaining', () => {
    expect(trueCount(6, 3)).toBe(2);
    expect(trueCount(7, 3.5)).toBe(2);
    expect(trueCount(-6, 2)).toBe(-3);
    expect(trueCount(0, 4)).toBe(0);
  });

  test('rounding conventions', () => {
    expect(trueCount(5, 2, 'floor')).toBe(2);
    expect(trueCount(-5, 2, 'floor')).toBe(-3);
    expect(trueCount(-5, 2, 'truncate')).toBe(-2);
    expect(trueCount(-5, 2, 'round')).toBe(-3);
    expect(trueCount(11, 4, 'round')).toBe(3);
    expect(trueCount(-1, 4, 'truncate')).toBe(0);
    expect(Object.is(trueCount(-1, 4, 'truncate'), -0)).toBe(false);
    // 2.1 / 0.7 = 2.9999999999999996 in floating point; it must still be 3.
    expect(trueCount(2.1, 0.7, 'floor')).toBe(3);
  });

  test('decks remaining to the half deck', () => {
    expect(estimateDecks(182)).toBe(3.5);
    expect(estimateDecks(208)).toBe(4);
    expect(estimateDecks(10)).toBe(0.5);
    expect(estimateDecks(0)).toBe(0.5);
  });

  test('explanation states the sum', () => {
    expect(explainTrueCount(7, 3.5, 'floor')).toBe('+7 ÷ 3.5 decks = +2.0, rounded down: +2.');
    expect(explainTrueCount(-5, 2, 'floor')).toBe('−5 ÷ 2 decks = −2.5, rounded down: −3.');
  });
});

describe('count drill sequences', () => {
  test('the full deck test is 52 cards, every card once, ending at 0', () => {
    const seq = buildCountSequence('deck', DEFAULT_RULES, seeded(9));
    expect(seq.cardCount).toBe(52);
    expect(new Set(seq.flashes.map((f) => `${f.cards[0].rank}${f.cards[0].suit}`)).size).toBe(52);
    expect(seq.finalCount).toBe(0);
  });

  test('running counts add up flash by flash', () => {
    for (const variant of ['single', 'pairs', 'table'] as const) {
      const seq = buildCountSequence(variant, DEFAULT_RULES, seeded(21));
      let rc = 0;
      for (const f of seq.flashes) {
        expect(f.value).toBe(runningCount(f.cards));
        rc += f.value;
        expect(f.runningAfter).toBe(rc);
      }
      expect(seq.finalCount).toBe(rc);
    }
  });

  test('table rounds are real hands: dealer finished, players stopped drawing at the right time', () => {
    const seq = buildCountSequence('table', DEFAULT_RULES, seeded(5));
    expect(seq.flashes).toHaveLength(6);
    for (const f of seq.flashes) {
      const t = f.table!;
      expect(t.players).toHaveLength(3);
      const dealer = handValue(t.dealer);
      expect(dealer.total >= 17).toBe(true);
      if (dealer.total === 17) expect(dealer.soft).toBe(false); // H17 default
      expect(f.cards).toHaveLength(t.dealer.length + t.players.reduce((n, p) => n + p.length, 0));
    }
  });

  test('learning and test scoring', () => {
    const seq = buildCountSequence('single', DEFAULT_RULES, seeded(2));
    const perfect = seq.flashes.map((f) => f.value);
    expect(scoreLearning(seq, perfect)).toMatchObject({ correct: true, tapsRight: 24, firstSlip: null, entered: seq.finalCount });
    const slipped = [...perfect];
    slipped[5] = null as unknown as number;
    const r = scoreLearning(seq, slipped);
    expect(r.firstSlip).toBe(5);
    expect(r.tapsRight).toBe(23);
    expect(scoreTest(seq, seq.finalCount).correct).toBe(true);
    expect(scoreTest(seq, seq.finalCount + 1).correct).toBe(false);
  });
});

describe('true count drill', () => {
  test('questions come from a real shoe position', () => {
    for (let i = 0; i < 50; i++) {
      const q = makeTrueCountQuestion('decks', DEFAULT_RULES, 'floor', seeded(i));
      expect(q.cardsRemaining + q.cardsDiscarded).toBe(416);
      expect(q.cardsRemaining).toBeGreaterThanOrEqual(13);
      expect(q.decksForAnswer % 0.5).toBe(0);
      expect(q.answer).toBe(trueCount(q.running, q.decksForAnswer, 'floor'));
    }
  });

  test('cards-remaining questions use the exact figure', () => {
    const q = makeTrueCountQuestion('cards', DEFAULT_RULES, 'floor', seeded(77));
    expect(q.decksForAnswer).toBeCloseTo(q.cardsRemaining / 52);
    expect(gradeTrueCount(q, q.answer).correct).toBe(true);
    expect(gradeTrueCount(q, q.answer + 1).correct).toBe(false);
  });

  test('tray: a deck estimate within half a deck is accepted and used', () => {
    const q = makeTrueCountQuestion('tray', { ...DEFAULT_RULES, decks: 6 }, 'floor', seeded(11));
    const actual = q.cardsRemaining / 52;
    const near = deckChoices(6).find((d) => Math.abs(d - actual) <= 0.5)!;
    const far = deckChoices(6).find((d) => Math.abs(d - actual) > 1)!;
    expect(gradeTrueCount(q, trueCount(q.running, near, 'floor'), near).correct).toBe(true);
    expect(gradeTrueCount(q, q.answer, far).deckEstimateOk).toBe(false);
    expect(gradeTrueCount(q, q.answer, far).correct).toBe(false);
  });

  test('works with a single deck', () => {
    for (let i = 0; i < 30; i++) {
      const q = makeTrueCountQuestion('decks', { ...DEFAULT_RULES, decks: 1 }, 'floor', seeded(i));
      expect(q.cardsRemaining).toBeGreaterThanOrEqual(13);
      expect(q.decksForAnswer).toBeGreaterThanOrEqual(0.5);
    }
  });
});
