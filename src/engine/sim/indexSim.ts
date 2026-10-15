import type { Pip } from '../cards';
import type { Rules } from '../rules';
import { buildChart } from '../strategy/chart';
import { type DeviationIndex, DEVIATIONS, type IndexPlay } from '../strategy/deviations';

/**
 * Monte Carlo check of the index numbers, with real shoes and multi-card hands.
 *
 * Each simulated shoe is a fully shuffled shoe for the table's deck count. The shoe is dealt in steps of a few
 * cards, up to the cut card. At every step, and for every row of the deviation table:
 * - The dealer's upcard for the row is taken out of the cards that are left (a random one of that rank).
 * - The player's hand is dealt from the top of what is left and played by basic strategy until it reaches the
 *   row's total. That gives multi-card hands at their natural frequency. Hands that basic strategy would split,
 *   double or surrender on the way are dropped, because in a real game that decision would never come up.
 * - The floored true count is taken at the moment of the decision: every card seen so far (earlier cards, the
 *   player's cards and the upcard) divided by decks left rounded to the half deck.
 * - Both plays are then played out from the same remaining cards (common random numbers), and the difference
 *   in result is recorded under that floored true count.
 * A dealer blackjack ends the hand before any play decision (dealer peeks), so those are dropped, except for
 * insurance, which is decided before the peek.
 *
 * After the decision, play continues by basic strategy, total-dependent, as in the chart.
 */

export const TC_MIN = -12;
export const TC_MAX = 12;
const BINS = TC_MAX - TC_MIN + 1;

/** Sums per floored true count bin: n, Σgain, Σgain². */
export interface Accumulator {
  n: Float64Array;
  sum: Float64Array;
  sumSq: Float64Array;
}

export function newAccumulator(): Accumulator {
  return { n: new Float64Array(BINS), sum: new Float64Array(BINS), sumSq: new Float64Array(BINS) };
}

export function mergeInto(a: Accumulator, b: { n: ArrayLike<number>; sum: ArrayLike<number>; sumSq: ArrayLike<number> }): void {
  for (let i = 0; i < BINS; i++) {
    a.n[i] += b.n[i];
    a.sum[i] += b.sum[i];
    a.sumSq[i] += b.sumSq[i];
  }
}

export interface RowResult {
  id: string;
  /** Every hand that reaches the decision, as index lists define it (two-card surrenders ignored). */
  all: Accumulator;
  /** As the decision comes up in this game: two-card hands that basic strategy surrenders are left out. */
  inGame: Accumulator;
}

/** Fast generator for the simulation (mulberry32). */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HILO = new Int8Array([0, -1, 1, 1, 1, 1, 1, 0, 0, 0, -1]);

type Code = 'H' | 'S' | 'D' | 'Ds';

/** Basic strategy lookups, built from the same chart the app shows. */
interface Basic {
  hard: Code[][]; // [total][up]
  soft: Code[][];
  split: boolean[][]; // [pip][up]
  surrender: boolean[][]; // [hand key][up]: two-card hands only
  doubleAfterSplit: boolean;
  doubleAllowed: (total: number) => boolean;
}

function buildBasic(rules: Rules): Basic {
  const chart = buildChart(rules);
  const mk = <T>(v: T, rows = 23) => Array.from({ length: rows }, () => new Array<T>(11).fill(v));
  const hard = mk<Code>('H');
  const soft = mk<Code>('S');
  for (let t = 17; t <= 22; t++) for (let u = 1; u <= 10; u++) hard[t][u] = 'S';
  for (let u = 1; u <= 10; u++) { soft[12][u] = 'H'; soft[21][u] = 'S'; }
  const split = mk<boolean>(false);
  // Two-card surrender by key: hard totals by total (5..20), pairs as 30 + pip (31..40).
  const surrender = mk<boolean>(false, 41);
  for (const s of chart.sections) {
    for (const row of s.rows) {
      row.cells.forEach((c) => {
        const u = c.upcard;
        if (s.id === 'hard') hard[row.cls.total][u] = c.code as Code;
        if (s.id === 'soft') soft[row.cls.total][u] = c.code as Code;
        if (s.id === 'pairs') split[row.cls.pip!][u] = c.code === 'Y' || c.code === 'Y/N';
        if (s.id === 'surrender' && c.code === 'SUR') {
          const key = row.cls.kind === 'pair' ? 30 + row.cls.pip! : row.cls.kind === 'soft' ? 0 : row.cls.total;
          if (key) surrender[key][u] = true;
        }
      });
    }
  }
  const da = (t: number) => rules.doubleOn === 'any' || (rules.doubleOn === '9-11' ? t >= 9 && t <= 11 : t >= 10 && t <= 11);
  return {
    hard, soft, split,
    surrender,
    doubleAfterSplit: rules.doubleAfterSplit,
    doubleAllowed: da,
  };
}

/** Hand state as (sum with aces as 1, has ace). */
function total(sum: number, ace: boolean): number {
  return ace && sum + 10 <= 21 ? sum + 10 : sum;
}
function isSoft(sum: number, ace: boolean): boolean {
  return ace && sum + 10 <= 21;
}

/** Hit or stand after the first decision, by basic strategy. */
function wantsHit(b: Basic, sum: number, ace: boolean, up: number): boolean {
  const t = total(sum, ace);
  if (t >= 21) return false;
  const code = isSoft(sum, ace) ? b.soft[t][up] : t <= 4 ? 'H' : b.hard[t][up];
  return code === 'H' || code === 'D';
}

/** Dealer's final total (22 = bust), drawing from `seq` at `k`. Returns [total, next index]. */
function dealerPlay(seq: Int8Array, k: number, up: number, hole: number, h17: boolean): [number, number] {
  let sum = up + hole;
  let ace = up === 1 || hole === 1;
  for (;;) {
    const t = total(sum, ace);
    if (t > 21) return [22, k];
    if (t > 17 || (t === 17 && !(h17 && isSoft(sum, ace)))) return [t, k];
    const c = seq[k++];
    sum += c;
    if (c === 1) ace = true;
  }
}

function settle(player: number, dealer: number, bet: number): number {
  if (player > 21) return -bet;
  if (dealer > 21 || player > dealer) return bet;
  return player === dealer ? 0 : -bet;
}

/** Plays one split hand starting with `first` from `seq` at `k`. Returns [final total, bet, next index]. */
function playSplitHand(b: Basic, seq: Int8Array, k: number, first: number, up: number): [number, number, number] {
  const second = seq[k++];
  let sum = first + second;
  let ace = first === 1 || second === 1;
  const t = total(sum, ace);
  const code = isSoft(sum, ace) ? b.soft[t]?.[up] : b.hard[t]?.[up];
  if (b.doubleAfterSplit && b.doubleAllowed(t) && (code === 'D' || code === 'Ds')) {
    const c = seq[k++];
    sum += c;
    if (c === 1) ace = true;
    return [total(sum, ace), 2, k];
  }
  while (wantsHit(b, sum, ace, up)) {
    const c = seq[k++];
    sum += c;
    if (c === 1) ace = true;
  }
  return [total(sum, ace), 1, k];
}

/** Result of one play from the decision point, per unit of the original bet. */
function playOut(
  play: IndexPlay, b: Basic, seq: Int8Array, k: number, sum: number, ace: boolean, up: number, hole: number, h17: boolean,
): number {
  switch (play) {
    case 'surrender':
      return -0.5;
    case 'stand': {
      const [d] = dealerPlay(seq, k, up, hole, h17);
      return settle(total(sum, ace), d, 1);
    }
    case 'double': {
      const c = seq[k++];
      const t = total(sum + c, ace || c === 1);
      if (t > 21) return -2;
      const [d] = dealerPlay(seq, k, up, hole, h17);
      return settle(t, d, 2);
    }
    case 'hit': {
      let s = sum;
      let a = ace;
      do {
        const c = seq[k++];
        s += c;
        if (c === 1) a = true;
      } while (wantsHit(b, s, a, up));
      const t = total(s, a);
      if (t > 21) return -1;
      const [d] = dealerPlay(seq, k, up, hole, h17);
      return settle(t, d, 1);
    }
    case 'split': {
      // Only used for 10,10: each hand starts with a 10. Tens are never resplit (basic strategy says no).
      const [t1, b1, k1] = playSplitHand(b, seq, k, 10, up);
      const [t2, b2, k2] = playSplitHand(b, seq, k1, 10, up);
      const [d] = dealerPlay(seq, k2, up, hole, h17);
      return settle(t1, d, b1) + settle(t2, d, b2);
    }
    default:
      throw new Error(`Unexpected play ${play}`);
  }
}

interface RowSpec {
  d: DeviationIndex;
  /** The decision can come up after hits (stand/hit rows), or only on the first two cards. */
  multiCard: boolean;
  /** Target total; for pairs, the pip. */
  total: number;
  pairPip: number;
  up: number;
}

function specFor(d: DeviationIndex): RowSpec {
  const multiCard = d.atOrAbove === 'stand' && d.below === 'hit';
  return {
    d, multiCard,
    total: d.hand ? d.hand.total : 0,
    pairPip: d.hand?.kind === 'pair' ? d.hand.pip! : 0,
    up: d.upcard,
  };
}

export interface SimOptions {
  rules: Rules;
  shoes: number;
  seed: number;
  /** Cards dealt between snapshots. */
  step?: number;
  rows?: readonly DeviationIndex[];
}

/** Runs the simulation and returns the per-row accumulators. */
export function simulateIndices(opts: SimOptions): RowResult[] {
  const { rules } = opts;
  const rows = (opts.rows ?? DEVIATIONS).map(specFor);
  const b = buildBasic(rules);
  const h17 = rules.hitSoft17;
  const lateSurrender = rules.surrender === 'late';
  const rng = mulberry32(opts.seed);
  const size = rules.decks * 52;
  const cut = Math.round(size * rules.penetration);
  const step = opts.step ?? 6;
  const shoe = new Int8Array(size);
  const scratch = new Int8Array(size);
  const results: RowResult[] = rows.map((r) => ({ id: r.d.id, all: newAccumulator(), inGame: newAccumulator() }));

  // Fresh shoe in pip order; shuffled each time.
  const base = new Int8Array(size);
  let i0 = 0;
  for (let d = 0; d < rules.decks; d++) for (let s = 0; s < 4; s++) for (let p = 1; p <= 13; p++) base[i0++] = Math.min(p, 10);

  const record = (acc: Accumulator, tc: number, g: number) => {
    const i = Math.max(TC_MIN, Math.min(TC_MAX, tc)) - TC_MIN;
    acc.n[i]++;
    acc.sum[i] += g;
    acc.sumSq[i] += g * g;
  };

  for (let sh = 0; sh < opts.shoes; sh++) {
    shoe.set(base);
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = shoe[i]; shoe[i] = shoe[j]; shoe[j] = t;
    }
    let rc = 0;
    for (let pos = 0; pos < cut; pos += step) {
      for (let r = 0; r < rows.length; r++) {
        const spec = rows[r];
        // Remaining cards, with one card of the upcard's rank taken out.
        let len = size - pos;
        scratch.set(shoe.subarray(pos), 0);
        let j = Math.floor(rng() * len);
        let tries = 0;
        while (scratch[j] !== spec.up && tries < len) { j = j + 1 === len ? 0 : j + 1; tries++; }
        if (scratch[j] !== spec.up) continue;
        scratch[j] = scratch[len - 1];
        len--;
        const up = spec.up;
        const p1 = scratch[0];
        const p2 = scratch[1];
        const hole = scratch[2];
        let k = 3;
        let seen = rc + HILO[up] + HILO[p1] + HILO[p2];
        let cards = 2;
        let sum = p1 + p2;
        let ace = p1 === 1 || p2 === 1;
        const dealerBJ = (up === 1 && hole === 10) || (up === 10 && hole === 1);
        const tcNow = () => {
          const left = len - cards; // the hole card is still unseen, so it counts as left
          const decks = Math.max(0.5, Math.round((left / 52) * 2) / 2);
          return Math.floor(seen / decks + 1e-9);
        };

        if (spec.d.group === 'insurance') {
          record(results[r].all, tcNow(), hole === 10 ? 2 : -1);
          record(results[r].inGame, tcNow(), hole === 10 ? 2 : -1);
          continue;
        }
        if (dealerBJ) continue;
        if (total(sum, ace) === 21) continue; // player blackjack: no decision

        // Pairs rows: exactly that pair.
        if (spec.pairPip) {
          if (p1 !== spec.pairPip || p2 !== spec.pairPip) continue;
        } else if (!spec.multiCard) {
          // Two-card rows (doubles, surrenders): a hard two-card total, non-split pairs included.
          if (isSoft(sum, ace) || total(sum, ace) !== spec.total) continue;
          if (p1 === p2 && b.split[p1][up]) continue;
        } else {
          // Stand/hit rows: play basic strategy until the hand reaches the target hard total.
          let surrenderedInGame = false;
          let ok = false;
          for (;;) {
            const t = total(sum, ace);
            const soft = isSoft(sum, ace);
            if (cards === 2 && p1 === p2 && b.split[p1][up]) break; // would split
            if (!soft && t === spec.total) {
              if (cards === 2 && lateSurrender) {
                const key = p1 === p2 ? 30 + p1 : t;
                if (b.surrender[key][up]) surrenderedInGame = true;
              }
              ok = true;
              break;
            }
            if (t >= spec.total && !soft) break; // passed it
            if (cards === 2) {
              const code = soft ? b.soft[t][up] : t <= 4 ? 'H' : b.hard[t][up];
              if (code === 'D' || code === 'Ds') break; // would double
              if (lateSurrender) {
                const key = p1 === p2 ? 30 + p1 : soft ? 0 : t;
                if (key && b.surrender[key][up]) surrenderedInGame = true; // would surrender before getting here
              }
            }
            if (!wantsHit(b, sum, ace, up)) break; // would stand short of the target
            const c = scratch[k++];
            sum += c;
            if (c === 1) ace = true;
            seen += HILO[c];
            cards++;
            if (total(sum, ace) > 21) break;
          }
          if (!ok) continue;
          const tc = tcNow();
          const g = playOut(spec.d.atOrAbove, b, scratch, k, sum, ace, up, hole, h17)
            - playOut(spec.d.below, b, scratch, k, sum, ace, up, hole, h17);
          record(results[r].all, tc, g);
          if (!surrenderedInGame) record(results[r].inGame, tc, g);
          continue;
        }

        const tc = tcNow();
        const g = playOut(spec.d.atOrAbove, b, scratch, k, sum, ace, up, hole, h17)
          - playOut(spec.d.below, b, scratch, k, sum, ace, up, hole, h17);
        record(results[r].all, tc, g);
        record(results[r].inGame, tc, g);
      }
      for (let c = pos; c < pos + step && c < size; c++) rc += HILO[shoe[c]];
    }
  }
  return results;
}

// ---------- Reading the results ----------

export interface BinStat {
  tc: number;
  n: number;
  mean: number;
  se: number;
}

export function binStats(acc: Accumulator): BinStat[] {
  const out: BinStat[] = [];
  for (let i = 0; i < BINS; i++) {
    const n = acc.n[i];
    if (n < 2) continue;
    const mean = acc.sum[i] / n;
    const variance = Math.max(0, acc.sumSq[i] / n - mean * mean) * (n / (n - 1));
    out.push({ tc: i + TC_MIN, n, mean, se: Math.sqrt(variance / n) });
  }
  return out;
}

export interface SimIndex {
  /** Lowest floored true count where deviating wins on average, with every higher count also winning. */
  index: number | null;
  /** Gain at the index and one below it, with standard errors. */
  atIndex: BinStat | null;
  below: BinStat | null;
  /** How many standard errors the two bins next to the switch are from zero (the smaller of the two). */
  zMin: number | null;
  /** 'clear' when both neighbouring bins are at least 2 standard errors from zero, else 'close'. */
  confidence: 'clear' | 'close' | 'none';
  /** Interpolated real-valued crossing between the two bins (bin centres taken at n + 0.5). */
  crossing: number | null;
}

/** Reads the index off the bins. Bins with fewer than `minN` samples are ignored. */
export function readIndex(acc: Accumulator, minN = 5000): SimIndex {
  const bins = binStats(acc).filter((b) => b.n >= minN && b.tc > TC_MIN && b.tc < TC_MAX);
  if (bins.length === 0) return { index: null, atIndex: null, below: null, zMin: null, confidence: 'none', crossing: null };
  let idx = -1;
  for (let i = bins.length - 1; i >= 0; i--) {
    if (bins[i].mean >= 0) idx = i; else break;
  }
  if (idx === -1) return { index: null, atIndex: null, below: bins[bins.length - 1], zMin: null, confidence: 'none', crossing: null };
  const at = bins[idx];
  const below = idx > 0 ? bins[idx - 1] : null;
  const zAt = at.mean / at.se;
  const zBelow = below ? -below.mean / below.se : Infinity;
  const zMin = Math.min(zAt, zBelow);
  let crossing: number | null = null;
  if (below) {
    const x0 = below.tc + 0.5;
    const x1 = at.tc + 0.5;
    crossing = x0 + ((0 - below.mean) * (x1 - x0)) / (at.mean - below.mean);
  }
  return {
    index: below ? at.tc : null,
    atIndex: at,
    below,
    zMin: Number.isFinite(zMin) ? zMin : null,
    confidence: zMin >= 2 ? 'clear' : 'close',
    crossing,
  };
}

export type { Pip };

/** Internals exposed for tests only. */
export const __test = { buildBasic, dealerPlay, playOut, wantsHit };
