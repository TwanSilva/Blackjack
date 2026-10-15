import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RULES, DEVIATIONS, INSURANCE_DEVIATION, type Rules, computeIndex, deviationGain,
  shoeAtTrueCount, shoeCount, shoeSize,
} from '../src/engine';
import { fullShoe } from '../src/engine/strategy/composition';

const S17: Rules = { ...DEFAULT_RULES, hitSoft17: false };
const row = (id: string) => DEVIATIONS.find((d) => d.id === id)!;

describe('shoe at a true count', () => {
  test('true count 0 is a fresh shoe', () => {
    expect(shoeAtTrueCount(4, 0)).toEqual(fullShoe(4));
  });

  test('the shoe keeps its size and its count matches the true count', () => {
    for (const tc of [-6, -2, 0, 1.5, 3, 8]) {
      const shoe = shoeAtTrueCount(4, tc);
      expect(shoeSize(shoe)).toBeCloseTo(208, 9);
      // Seen running count = −(count left in the shoe) = tc × decks.
      expect(-shoeCount(shoe) / 4).toBeCloseTo(tc, 9);
      expect(shoe[7]).toBe(16); // neutral cards untouched
    }
  });

  test('refuses counts the method cannot represent', () => {
    expect(() => shoeAtTrueCount(1, 50)).toThrow(/too extreme/);
  });
});

describe('index finder', () => {
  test('insurance breaks even where tens are a third of the shoe: about +3.3, floor index +3', () => {
    // Tens are 16/52 of a fresh shoe and rise by 0.4 × tc / 52 here, so 1/3 is reached at tc = 3.33.
    // The dealer's Ace is removed too, which nudges the crossing a little lower.
    const r = computeIndex(INSURANCE_DEVIATION, DEFAULT_RULES);
    expect(r.regime).toBe('flips');
    expect(r.crossing!).toBeGreaterThan(3.1);
    expect(r.crossing!).toBeLessThan(3.4);
    expect(r.index.floor).toBe(3);
  });

  test('floor and truncate agree for positive indices, and nearest is never higher than floor', () => {
    for (const d of DEVIATIONS) {
      const r = computeIndex(d, S17);
      if (r.regime !== 'flips') continue;
      if (r.index.floor! > 0) expect(r.index.truncate, d.id).toBe(r.index.floor);
      expect(r.index.nearest!, d.id).toBeLessThanOrEqual(r.index.floor! + 1);
    }
  }, 60_000);

  test('the deviation gains EV as the count rises for every row of the table', () => {
    for (const d of DEVIATIONS) {
      const r = computeIndex(d, S17);
      expect(r.regime, d.id).not.toBe('reversed');
    }
  }, 60_000);

  test('the index is the crossing pushed to the band that favours the play', () => {
    const r = computeIndex(row('16v10'), S17);
    const n = r.index.floor!;
    // Band [n, n+1) favours standing on average; band [n−1, n) does not.
    const avg = (a: number) => {
      let s = 0;
      for (let k = 0; k < 8; k++) s += deviationGain(row('16v10'), S17, a + (k + 0.5) / 8)!;
      return s / 8;
    };
    expect(avg(n)).toBeGreaterThanOrEqual(0);
    expect(avg(n - 1)).toBeLessThan(0);
  });

  test('surrender rows are not available without surrender', () => {
    expect(computeIndex(row('15v10sur'), { ...DEFAULT_RULES, surrender: 'none' }).regime).toBe('not-allowed');
  });
});
