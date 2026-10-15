import { type TrueCountRounding, explainTrueCount, roundDecks, trueCount } from '../counting/count';
import { signed } from '../counting/systems';
import type { Rules } from '../rules';
import type { Rng } from '../shoe';
import { edgeAtTrueCount } from './edge';
import { type BetGrade, type BetSpread, gradeBet, spreadLevels } from './spread';

export type BetDrillMode = 'shown' | 'hidden';

export interface BetQuestion {
  trueCount: number;
  /** Hidden mode: running count and decks left that round to the true count. */
  running?: number;
  decksLeft?: number;
  /** Bet sizes to choose from, in units. */
  levels: number[];
}

/**
 * A bet sizing question. True counts are spread around the spread's steps (from 3 below the first step to 2
 * above the last) so every bet level comes up, with neutral and negative counts mixed in.
 */
export function makeBetQuestion(
  spread: BetSpread,
  rules: Rules,
  rounding: TrueCountRounding,
  mode: BetDrillMode,
  rng: Rng = Math.random,
): BetQuestion {
  const first = spread.steps[0]?.from ?? 1;
  const last = spread.steps.at(-1)?.from ?? 1;
  const lo = Math.min(first - 3, -2);
  const hi = last + 2;
  const tc = lo + Math.floor(rng() * (hi - lo + 1));
  const q: BetQuestion = { trueCount: tc, levels: spreadLevels(spread) };
  if (mode === 'hidden') {
    const max = Math.max(1, rules.decks - 1);
    for (let tries = 0; tries < 50; tries++) {
      const decksLeft = roundDecks(1 + rng() * (max - 1 + 0.5));
      const options: number[] = [];
      for (let rc = Math.floor((tc - 1.5) * decksLeft); rc <= Math.ceil((tc + 1.5) * decksLeft); rc++) {
        if (trueCount(rc, decksLeft, rounding) === tc) options.push(rc);
      }
      if (options.length) {
        q.running = options[Math.floor(rng() * options.length)];
        q.decksLeft = decksLeft;
        break;
      }
    }
  }
  return q;
}

export interface BetFeedback extends BetGrade {
  /** The true count sum in hidden mode. */
  countSum: string | null;
  /** "At this count the player's edge is about +1.4%." */
  edgeNote: string;
}

/** Grades a bet, adding the true count sum (hidden mode) and the player's edge at the count from the EV engine. */
export function gradeBetQuestion(
  q: BetQuestion,
  spread: BetSpread,
  rules: Rules,
  rounding: TrueCountRounding,
  chosenUnits: number,
  unitPotatoes: number,
): BetFeedback {
  const g = gradeBet(spread, q.trueCount, chosenUnits, unitPotatoes);
  // A displayed count stands for real counts in its band; use the middle of a floor band for the edge.
  const edge = edgeAtTrueCount(rules, rounding === 'floor' ? q.trueCount + 0.4 : q.trueCount);
  const pct = `${edge >= 0 ? '+' : '−'}${Math.abs(edge * 100).toFixed(1)}%`;
  return {
    ...g,
    countSum: q.running !== undefined ? explainTrueCount(q.running, q.decksLeft!, rounding) : null,
    edgeNote: `At a true count of ${signed(q.trueCount)} the player's edge is about ${pct} (estimate from the strategy engine).`,
  };
}
