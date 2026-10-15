import { describe, expect, test } from 'vitest';
import { DEFAULT_RULES, DEVIATIONS, type Rules } from '../src/engine';
import { __test, binStats, readIndex, simulateIndices } from '../src/engine/sim/indexSim';

const { buildBasic, dealerPlay, playOut } = __test;
const seq = (...pips: number[]) => Int8Array.from(pips);
const S17: Rules = { ...DEFAULT_RULES, hitSoft17: false };

describe('simulator play-out on fixed cards', () => {
  test('dealer soft 17 depends on the rule', () => {
    // 6 up, Ace in the hole: soft 17. H17 draws a 10 (hard 17, stands); S17 stands at once.
    expect(dealerPlay(seq(10, 5), 0, 6, 1, true)).toEqual([17, 1]);
    expect(dealerPlay(seq(10, 5), 0, 6, 1, false)).toEqual([17, 0]);
    expect(dealerPlay(seq(10), 0, 6, 10, true)).toEqual([22, 1]); // 16 draws 10: bust
  });

  test('stand, hit, double, surrender and split results', () => {
    const b = buildBasic(DEFAULT_RULES);
    // Player hard 16 vs 10, dealer hole 7 (17).
    expect(playOut('stand', b, seq(5), 0, 16, false, 10, 7, true)).toBe(-1);
    expect(playOut('hit', b, seq(4), 0, 16, false, 10, 7, true)).toBe(1); // 20 beats 17
    expect(playOut('hit', b, seq(6), 0, 16, false, 10, 7, true)).toBe(-1); // bust
    expect(playOut('surrender', b, seq(), 0, 16, false, 10, 7, true)).toBe(-0.5);
    // Hard 11 vs 6, hole 10 (16): double gets 9 (20); dealer draws 5 (21).
    expect(playOut('double', b, seq(9, 5), 0, 11, false, 6, 10, true)).toBe(-2);
    expect(playOut('double', b, seq(9, 10), 0, 11, false, 6, 10, true)).toBe(2);
    // 10,10 split vs 6 with hole 10: hands 10+9 (stand 19) and 10+8 (stand 18); dealer 16 draws 10, busts.
    expect(playOut('split', b, seq(9, 8, 10), 0, 20, false, 6, 10, true)).toBe(2);
  });
});

describe('simulator statistics', () => {
  const res = simulateIndices({ rules: DEFAULT_RULES, shoes: 6000, seed: 42 });
  const byId = (id: string) => res.find((r) => r.id === id)!;

  test('insurance gain matches the share of tens left in the shoe', () => {
    // Off the top, 16 of 52 cards are tens: insurance returns 3 × 16/52 − 1 = −0.077 per unit. Bin 0 holds
    // slightly positive counts (more tens left), so its gain is a little higher than that.
    const bins = binStats(byId('insurance').all);
    const b0 = bins.find((b) => b.tc === 0)!;
    expect(b0.mean).toBeGreaterThan(-0.09);
    expect(b0.mean).toBeLessThan(-0.03);
    // The gain rises with the count, bin after bin.
    const mids = bins.filter((b) => b.tc >= -3 && b.tc <= 4).map((b) => b.mean);
    for (let i = 1; i < mids.length; i++) expect(mids[i]).toBeGreaterThan(mids[i - 1] - 0.03);
  });

  test('every row gets samples, and multi-card rows see more than two-card hands', () => {
    for (const d of DEVIATIONS) {
      const n = binStats(byId(d.id).all).reduce((a, b) => a + b.n, 0);
      expect(n, d.id).toBeGreaterThan(5000);
    }
  });

  test('in this game, two-card 16 vs 10 is surrendered, so the in-game set is smaller', () => {
    const all = binStats(byId('16v10').all).reduce((a, b) => a + b.n, 0);
    const inGame = binStats(byId('16v10').inGame).reduce((a, b) => a + b.n, 0);
    expect(inGame).toBeLessThan(all);
    // Under S17 with surrender 16 vs 10 is still surrendered; without surrender nothing is left out.
    const noSur = simulateIndices({ rules: { ...S17, surrender: 'none' }, shoes: 300, seed: 1, rows: [DEVIATIONS.find((d) => d.id === '16v10')!] })[0];
    expect(binStats(noSur.inGame).reduce((a, b) => a + b.n, 0)).toBe(binStats(noSur.all).reduce((a, b) => a + b.n, 0));
  });

  test('the index reader finds a switch for insurance near +3', () => {
    const r = readIndex(byId('insurance').all, 2000);
    expect(r.index).not.toBeNull();
    expect(Math.abs(r.index! - 3)).toBeLessThanOrEqual(1);
  });
});
