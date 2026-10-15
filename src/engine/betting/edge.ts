import { doubleTotalAllowed } from '../actions';
import type { Pip } from '../cards';
import { type TrueCountRounding, CountTracker, DEFAULT_TC_ROUNDING } from '../counting/count';
import { type Rules, strategyKey } from '../rules';
import { type Rng, Shoe } from '../shoe';
import { pipsValue } from '../hand';
import { type Composition, cardsIn, fullShoe, removeCards } from '../strategy/composition';
import { evaluatePips } from '../strategy/evaluate';
import { shoeAtTrueCount } from '../strategy/indexCompute';
import { type BetSpread, unitsFor } from './spread';

/**
 * The player's expected return per round, per unit bet, for one shoe composition, playing basic strategy for
 * each exact two-card hand. Negative is the house edge. Every starting deal is counted: both player cards and
 * the upcard with card removal, blackjacks, and the dealer peek (or, with no hole card, losing everything to a
 * dealer blackjack). It uses the same EV engine as the strategy chart, so its limits apply here too.
 */
export function expectedReturn(rules: Rules, shoe: Composition): number {
  const n = cardsIn(shoe);
  let total = 0;
  for (let a = 1; a <= 10; a++) {
    for (let b = a; b <= 10; b++) {
      const pa = shoe[a] / n;
      const pb = (shoe[b] - (a === b ? 1 : 0)) / (n - 1);
      if (pa <= 0 || pb <= 0) continue;
      const pPair = (a === b ? 1 : 2) * pa * pb;
      const afterPlayer = removeCards(shoe, [a, b]);
      const m = n - 2;
      for (let u = 1; u <= 10; u++) {
        const pu = afterPlayer[u] / m;
        if (pu <= 0) continue;
        const rest = removeCards(afterPlayer, [u]);
        const left = m - 1;
        const pDealerBJ = u === 1 ? rest[10] / left : u === 10 ? rest[1] / left : 0;
        const playerBJ = (a === 1 && b === 10);
        let v: number;
        if (playerBJ) {
          v = (1 - pDealerBJ) * rules.blackjackPays;
        } else {
          const total2 = pipsValue([a, b]).total;
          const e = evaluatePips([a as Pip, b as Pip], u as Pip, rules, {
            double: doubleTotalAllowed(total2, rules),
            surrender: rules.surrender === 'late',
            split: a === b && rules.maxSplitHands >= 2,
          }, shoe);
          const best = e.options[0].ev;
          // With a peek the EVs are after the peek, so add the dealer blackjacks back in (lose one unit).
          v = rules.dealerPeeks ? -pDealerBJ + (1 - pDealerBJ) * best : best;
        }
        total += pPair * pu * v;
      }
    }
  }
  return total;
}

const edgeCache = new Map<string, number>();

/** Player's expected return per unit at a real true count (an average shoe at that count, 4 decks left). */
export function edgeAtTrueCount(rules: Rules, tc: number): number {
  tc = Math.round(tc * 20) / 20; // cache at 0.05 steps
  const key = `${strategyKey(rules)}|${rules.blackjackPays}|${tc}`;
  let v = edgeCache.get(key);
  if (v === undefined) {
    const decks = Math.min(4, rules.decks);
    v = expectedReturn(rules, tc === 0 ? fullShoe(decks) : shoeAtTrueCount(decks, tc));
    edgeCache.set(key, v);
  }
  return v;
}

/** Off-the-top expected return for the table's full shoe. Negative: the house edge. */
export function offTheTopReturn(rules: Rules): number {
  const key = `${strategyKey(rules)}|${rules.blackjackPays}|top`;
  let v = edgeCache.get(key);
  if (v === undefined) {
    v = expectedReturn(rules, fullShoe(rules.decks));
    edgeCache.set(key, v);
  }
  return v;
}

export const TC_FREQ_MIN = -6;
export const TC_FREQ_MAX = 10;

export interface CountBin {
  /** Share of rounds that start at this displayed (rounded) true count. */
  freq: number;
  /** The average real true count behind it: a floored +2 is really +2 to +2.99, about +2.35 on average. */
  meanTc: number;
}

/**
 * How often each (rounded) true count comes up at the start of a round, from dealt shoes, and the average real
 * count behind each one. Cards leave the shoe about 2.7 per hand per seat (players plus dealer). Counts beyond
 * the ends are lumped into the end bins.
 */
export function trueCountFrequencies(
  rules: Rules,
  seats = 3,
  rounding: TrueCountRounding = DEFAULT_TC_ROUNDING,
  shoes = 1500,
  rng: Rng = seeded(20261015),
): Map<number, CountBin> {
  const counts = new Map<number, number>();
  const sums = new Map<number, number>();
  let rounds = 0;
  const perRound = Math.round(2.7 * (seats + 1));
  for (let s = 0; s < shoes; s++) {
    const shoe = new Shoe(rules.decks, rules.penetration, rng);
    const t = new CountTracker(rules.decks);
    while (!shoe.needsShuffle) {
      const tc = Math.max(TC_FREQ_MIN, Math.min(TC_FREQ_MAX, t.trueCount(rounding)));
      const real = t.running / Math.max(0.5, Math.round(t.decksRemaining * 2) / 2);
      counts.set(tc, (counts.get(tc) ?? 0) + 1);
      sums.set(tc, (sums.get(tc) ?? 0) + real);
      rounds++;
      for (let i = 0; i < perRound && shoe.remaining > 0; i++) t.see(shoe.draw());
    }
  }
  const out = new Map<number, CountBin>();
  for (let tc = TC_FREQ_MIN; tc <= TC_FREQ_MAX; tc++) {
    const n = counts.get(tc) ?? 0;
    out.set(tc, { freq: n / rounds, meanTc: n ? sums.get(tc)! / n : tc + 0.5 });
  }
  return out;
}

function seeded(seed: number): Rng {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Variance of one round's result per unit bet squared. A commonly used figure for shoe games; an assumption. */
export const ROUND_VARIANCE = 1.3;

export interface SpreadOutlook {
  /** Expected win per round, in potatoes. */
  perRound: number;
  /** Standard deviation of one round, in potatoes. */
  sdPerRound: number;
  /** Average bet per round, in potatoes. */
  avgBet: number;
  /** Expected win and one standard deviation over 100 rounds. */
  per100: number;
  sdPer100: number;
  /** Rounds until the expected win equals one standard deviation ("N0"), or null with no edge. */
  n0: number | null;
  /** Chance of losing the whole bankroll playing on forever (diffusion estimate). 1 with no edge. */
  riskOfRuin: number;
  /** Player's expected return per unit at each displayed true count (at the real count behind it). */
  edgeByCount: { tc: number; freq: number; meanTc: number; edge: number; units: number }[];
}

/**
 * Expected result of a spread: the edge at each count, how often each count comes up, and the bets.
 * Basic strategy only (playing deviations and insurance add a little). Risk of ruin uses the diffusion
 * formula exp(−2 × win per round × bankroll ÷ variance per round). These are estimates.
 */
export function spreadOutlook(
  rules: Rules,
  spread: BetSpread,
  unitPotatoes: number,
  bankroll: number,
  freqs: Map<number, CountBin>,
): SpreadOutlook {
  let mu = 0;
  let variance = 0;
  let avgBet = 0;
  const edgeByCount: SpreadOutlook['edgeByCount'] = [];
  for (const [tc, { freq, meanTc }] of freqs) {
    if (freq === 0) continue;
    const units = unitsFor(spread, tc);
    const bet = units * unitPotatoes;
    const edge = edgeAtTrueCount(rules, Math.max(-7, Math.min(9, meanTc)));
    mu += freq * bet * edge;
    variance += freq * bet * bet * ROUND_VARIANCE;
    avgBet += freq * bet;
    edgeByCount.push({ tc, freq, meanTc, edge, units });
  }
  const sd = Math.sqrt(variance);
  return {
    perRound: mu,
    sdPerRound: sd,
    avgBet,
    per100: 100 * mu,
    sdPer100: 10 * sd,
    n0: mu > 0 ? variance / (mu * mu) : null,
    riskOfRuin: mu > 0 ? Math.exp((-2 * mu * bankroll) / variance) : 1,
    edgeByCount,
  };
}
