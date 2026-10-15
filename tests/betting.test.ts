import { describe, expect, test } from 'vitest';
import {
  type BetSpread, DEFAULT_RULES, DEFAULT_SPREAD, describeSpread, edgeAtTrueCount, gradeBet, offTheTopReturn,
  spreadLevels, spreadOutlook, trueCountFrequencies, unitsFor, validateSpread,
} from '../src/engine';

describe('bet spread', () => {
  test('default: 1 unit at +1 or less, rising to 8', () => {
    const at = (tc: number) => unitsFor(DEFAULT_SPREAD, tc);
    expect([at(-4), at(0), at(1), at(2), at(3), at(4), at(5), at(9)]).toEqual([1, 1, 1, 2, 4, 6, 8, 8]);
    expect(spreadLevels(DEFAULT_SPREAD)).toEqual([1, 2, 4, 6, 8]);
    expect(describeSpread(DEFAULT_SPREAD)).toBe('1 unit up to +1, 2 at +2, 4 at +3, 6 at +4, 8 at +5 and up.');
    expect(validateSpread(DEFAULT_SPREAD)).toEqual([]);
  });

  test('invalid spreads are explained', () => {
    const bad: BetSpread = { base: 2, steps: [{ from: 3, units: 4 }, { from: 2, units: 1 }] };
    const errors = validateSpread(bad);
    expect(errors.some((e) => /go up in true count/.test(e))).toBe(true);
    expect(errors.some((e) => /never bet less/.test(e))).toBe(true);
    expect(validateSpread({ base: 0, steps: [] })[0]).toMatch(/base bet/);
  });

  test('bets are graded against the spread', () => {
    expect(gradeBet(DEFAULT_SPREAD, 3, 4, 10).verdict).toBe('right');
    const over = gradeBet(DEFAULT_SPREAD, 0, 8, 10);
    expect(over.verdict).toBe('over');
    expect(over.explanation).toMatch(/your spread says 1 unit \(10 potatoes\).*over-betting/);
    const under = gradeBet(DEFAULT_SPREAD, 5, 2, 10);
    expect(under.verdict).toBe('under');
    expect(under.explanation).toMatch(/8 units \(80 potatoes\).*under-betting/);
  });
});

describe('edge from the EV engine', () => {
  test('house edge for the default table is in the known range, and rule changes move it the known way', () => {
    const base = offTheTopReturn(DEFAULT_RULES);
    expect(base).toBeLessThan(-0.004);
    expect(base).toBeGreaterThan(-0.008);
    const s17 = offTheTopReturn({ ...DEFAULT_RULES, hitSoft17: false });
    expect(s17 - base).toBeGreaterThan(0.0015); // S17 is worth about 0.2%
    expect(s17 - base).toBeLessThan(0.0026);
    const sixFive = offTheTopReturn({ ...DEFAULT_RULES, blackjackPays: 1.2 });
    expect(base - sixFive).toBeGreaterThan(0.012); // 6:5 costs about 1.4%
    expect(base - sixFive).toBeLessThan(0.0155);
    const noSur = offTheTopReturn({ ...DEFAULT_RULES, surrender: 'none' });
    expect(base - noSur).toBeGreaterThan(0.0004); // late surrender is worth a little under 0.1%
    expect(base - noSur).toBeLessThan(0.0015);
  });

  test('the edge rises with the true count, about half a percent per point', () => {
    let prev = -Infinity;
    for (let tc = -4; tc <= 6; tc++) {
      const e = edgeAtTrueCount(DEFAULT_RULES, tc);
      expect(e).toBeGreaterThan(prev);
      prev = e;
    }
    const slope = (edgeAtTrueCount(DEFAULT_RULES, 4) - edgeAtTrueCount(DEFAULT_RULES, 0)) / 4;
    expect(slope).toBeGreaterThan(0.004);
    expect(slope).toBeLessThan(0.007);
  });

  test('count frequencies sum to 1, and a displayed count sits inside its floor band', () => {
    const f = trueCountFrequencies(DEFAULT_RULES, 3, 'floor', 300);
    const total = [...f.values()].reduce((a, b) => a + b.freq, 0);
    expect(total).toBeCloseTo(1, 9);
    for (const [tc, { freq, meanTc }] of f) {
      if (freq > 0.01 && tc > -6 && tc < 10) {
        expect(meanTc).toBeGreaterThanOrEqual(tc);
        expect(meanTc).toBeLessThan(tc + 1);
      }
    }
  });

  test('flat betting loses; spreading with the count wins a little; more bankroll means less risk', () => {
    const f = trueCountFrequencies(DEFAULT_RULES, 3, 'floor', 400);
    const flat = spreadOutlook(DEFAULT_RULES, { base: 1, steps: [] }, 10, 2000, f);
    expect(flat.perRound).toBeLessThan(0);
    expect(flat.riskOfRuin).toBe(1);
    expect(flat.n0).toBeNull();
    const spread = spreadOutlook(DEFAULT_RULES, DEFAULT_SPREAD, 10, 2000, f);
    expect(spread.perRound).toBeGreaterThan(0);
    expect(spread.perRound / spread.avgBet).toBeLessThan(0.01); // a small edge
    const big = spreadOutlook(DEFAULT_RULES, DEFAULT_SPREAD, 10, 20000, f);
    expect(big.riskOfRuin).toBeLessThan(spread.riskOfRuin);
  });
});
