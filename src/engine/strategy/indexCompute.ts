import { PIPS } from '../cards';
import { TRUE_COUNT_ROUNDINGS, type TrueCountRounding, roundDecks, trueCount } from '../counting/count';
import { type CountSystem, HI_LO } from '../counting/systems';
import type { Rules } from '../rules';
import { type Composition, cardsIn, fullShoe } from './composition';
import type { DeviationIndex, IndexPlay } from './deviations';
import { evaluateClassOn, insuranceEv } from './evaluate';

/**
 * Computes count indices with the EV engine instead of taking them from a list.
 *
 * Method:
 * 1. A shoe at true count t: `decksRemaining` decks with low cards (count +1) taken out and high cards
 *    (count −1) put in, in proportion to how many of each rank there are, until the shoe's count is
 *    −t × decks. That is the shoe left after a running count of t × decks has been seen. Neutral cards
 *    (7–9) are untouched and the shoe size stays the same.
 * 2. Both plays of a row are evaluated on that shoe with the same total-dependent EV calculation as the
 *    chart, on a grid of true counts.
 * 3. The crossing is the true count where the two EVs are equal.
 * 4. The integer index for a rounding: a displayed count of n stands for the real counts that whole running
 *    counts produce at this shoe depth and that round to n (floor, 4 decks left: n, n+0.25, n+0.5, n+0.75).
 *    The index is the lowest n whose real counts favour the deviation on average, and every higher n does too.
 *
 * Limits: the shoe at a count is the average shoe for that count, not every shoe that could give it, and only
 * two-card hands are evaluated. src/engine/sim/indexSim.ts checks these numbers by simulating real shoes.
 */

/** The average remaining shoe at true count `tc`. Valid for level-one counts such as Hi-Lo. */
export function shoeAtTrueCount(decksRemaining: number, tc: number, system: CountSystem = HI_LO): Composition {
  const c = fullShoe(decksRemaining);
  let low = 0;
  let high = 0;
  for (const p of PIPS) {
    const v = system.values[p];
    if (Math.abs(v) > 1) throw new Error('shoeAtTrueCount supports level-one counts only');
    if (v > 0) low += c[p];
    if (v < 0) high += c[p];
  }
  // Moving x cards from low to high shifts the shoe's count by −2x.
  const x = (tc * decksRemaining) / 2;
  if (x >= low || -x >= high) throw new Error(`True count ${tc} is too extreme for ${decksRemaining} decks`);
  const out = c.slice();
  for (const p of PIPS) {
    const v = system.values[p];
    if (v > 0) out[p] = c[p] * (1 - x / low);
    if (v < 0) out[p] = c[p] * (1 + x / high);
  }
  return out;
}

/** Count of a shoe composition (the cards still in it). */
export function shoeCount(shoe: Composition, system: CountSystem = HI_LO): number {
  let s = 0;
  for (const p of PIPS) s += shoe[p] * system.values[p];
  return s;
}

function playEv(d: DeviationIndex, play: IndexPlay, rules: Rules, shoe: Composition): number | null {
  if (play === 'insurance') return insuranceEv([], rules, shoe);
  if (play === 'no-insurance') return 0;
  const e = evaluateClassOn(d.hand!, d.upcard, rules, shoe);
  return e.options.find((o) => o.action === play)?.ev ?? null;
}

/** EV of the at-or-above play minus the below play, at true count `tc`. Null when a play isn't allowed. */
export function deviationGain(d: DeviationIndex, rules: Rules, tc: number, decksRemaining = 4): number | null {
  const shoe = shoeAtTrueCount(decksRemaining, tc);
  const a = playEv(d, d.atOrAbove, rules, shoe);
  const b = playEv(d, d.below, rules, shoe);
  return a === null || b === null ? null : a - b;
}

export type IndexRegime = 'flips' | 'always' | 'never' | 'reversed' | 'not-allowed';

export interface ComputedIndex {
  deviation: DeviationIndex;
  regime: IndexRegime;
  /** Real-valued true count where the two plays are worth the same, or null. */
  crossing: number | null;
  /** Integer index per rounding: play the at-or-above action when the rounded true count is at least this. */
  index: Record<TrueCountRounding, number | null>;
  decksRemaining: number;
}

export interface ComputeOptions {
  decksRemaining?: number;
  /** True counts searched, inclusive. */
  min?: number;
  max?: number;
}

const STEP = 0.125;

export function computeIndex(d: DeviationIndex, rules: Rules, opts: ComputeOptions = {}): ComputedIndex {
  const decksRemaining = opts.decksRemaining ?? 4;
  const min = opts.min ?? -10;
  const max = opts.max ?? 10;
  const empty = { floor: null, nearest: null, truncate: null };

  // Grid at band-aligned midpoints: every band of width 1 holds exactly 8 points.
  const ts: number[] = [];
  for (let t = min - 1.5 + STEP / 2; t < max + 1.5; t += STEP) ts.push(t);
  const gains: number[] = [];
  for (const t of ts) {
    const g = deviationGain(d, rules, t, decksRemaining);
    if (g === null) return { deviation: d, regime: 'not-allowed', crossing: null, index: empty, decksRemaining };
    gains.push(g);
  }

  // Crossing from losing to winning, refined by bisection between the two grid points.
  let crossing: number | null = null;
  let reversed = false;
  for (let i = 1; i < ts.length; i++) {
    if (gains[i - 1] < 0 && gains[i] >= 0 && crossing === null) {
      let lo = ts[i - 1];
      let hi = ts[i];
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if ((deviationGain(d, rules, mid, decksRemaining) as number) < 0) lo = mid; else hi = mid;
      }
      crossing = (lo + hi) / 2;
    }
    if (gains[i - 1] >= 0 && gains[i] < 0) reversed = true;
  }

  // A displayed count n stands for the real counts that whole running counts produce at this depth and that
  // round to n: with 4 decks left and floor, RC 4n..4n+3, so real counts n, n+0.25, n+0.5, n+0.75.
  const divisor = roundDecks(decksRemaining);
  const gainAtRc = new Map<number, number>();
  const gainFor = (rc: number) => {
    let g = gainAtRc.get(rc);
    if (g === undefined) {
      g = deviationGain(d, rules, rc / divisor, decksRemaining) as number;
      gainAtRc.set(rc, g);
    }
    return g;
  };
  const avg = (n: number, r: TrueCountRounding) => {
    const lo = Math.floor((n - 1.5) * divisor);
    const hi = Math.ceil((n + 1.5) * divisor);
    let sum = 0;
    let count = 0;
    for (let rc = lo; rc <= hi; rc++) {
      if (trueCount(rc, divisor, r) !== n) continue;
      sum += gainFor(rc);
      count++;
    }
    return sum / count;
  };

  const index = { ...empty } as Record<TrueCountRounding, number | null>;
  for (const r of TRUE_COUNT_ROUNDINGS) {
    let found: number | null = null;
    for (let n = max; n >= min; n--) {
      if (avg(n, r) >= 0) found = n; else break;
    }
    index[r] = found;
  }

  let regime: IndexRegime;
  if (reversed) regime = 'reversed';
  else if (gains.every((g) => g >= 0)) regime = 'always';
  else if (gains.every((g) => g < 0)) regime = 'never';
  else regime = 'flips';
  return { deviation: d, regime, crossing, index, decksRemaining };
}

/** Cards in a shoe composition (fractional for a shoe at a count). */
export function shoeSize(shoe: Composition): number {
  return cardsIn(shoe);
}
