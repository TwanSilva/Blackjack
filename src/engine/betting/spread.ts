import { signed } from '../counting/systems';

/**
 * A bet spread: how many units to bet at each true count. `base` units below the first step; each step
 * raises the bet from its true count up. True counts are the player's rounded counts (floor by default).
 */
export interface BetSpread {
  /** Units bet at counts below the first step. */
  base: number;
  /** Ascending true counts, each with the units bet at that count and above (until the next step). */
  steps: { from: number; units: number }[];
}

/** 1 unit at +1 or less, then 2, 4, 6 and a maximum of 8 units from +5. */
export const DEFAULT_SPREAD: Readonly<BetSpread> = Object.freeze({
  base: 1,
  steps: [
    { from: 2, units: 2 },
    { from: 3, units: 4 },
    { from: 4, units: 6 },
    { from: 5, units: 8 },
  ],
});

export const DEFAULT_UNIT_POTATOES = 10;

/** Units to bet at a (rounded) true count. */
export function unitsFor(spread: BetSpread, trueCount: number): number {
  let units = spread.base;
  for (const s of spread.steps) if (trueCount >= s.from) units = s.units;
  return units;
}

export function maxUnits(spread: BetSpread): number {
  return Math.max(spread.base, ...spread.steps.map((s) => s.units));
}

/** The distinct bet sizes the spread uses, smallest first. */
export function spreadLevels(spread: BetSpread): number[] {
  return [...new Set([spread.base, ...spread.steps.map((s) => s.units)])].sort((a, b) => a - b);
}

/** Problems with a spread, in plain words; empty when it is valid. */
export function validateSpread(spread: BetSpread): string[] {
  const out: string[] = [];
  const isUnits = (u: number) => Number.isInteger(u) && u >= 1 && u <= 100;
  if (!isUnits(spread.base)) out.push('The base bet must be a whole number of units from 1 to 100.');
  let prevFrom = -Infinity;
  let prevUnits = spread.base;
  for (const s of spread.steps) {
    if (!Number.isInteger(s.from) || s.from < -10 || s.from > 15) out.push(`Step at ${s.from}: the true count must be a whole number from −10 to +15.`);
    if (s.from <= prevFrom) out.push(`Step at ${signed(s.from)}: steps must go up in true count.`);
    if (!isUnits(s.units)) out.push(`Step at ${signed(s.from)}: the bet must be a whole number of units from 1 to 100.`);
    if (s.units < prevUnits) out.push(`Step at ${signed(s.from)}: a higher count should never bet less than a lower one.`);
    prevFrom = s.from;
    prevUnits = s.units;
  }
  return out;
}

/** "1 unit up to +1, 2 at +2, 4 at +3, 6 at +4, 8 at +5 and up." */
export function describeSpread(spread: BetSpread): string {
  if (spread.steps.length === 0) return `Flat: ${spread.base} unit${spread.base === 1 ? '' : 's'} at every count.`;
  const first = spread.steps[0].from;
  const parts = [`${spread.base} unit${spread.base === 1 ? '' : 's'} up to ${signed(first - 1)}`];
  spread.steps.forEach((s, i) => {
    const last = i === spread.steps.length - 1;
    parts.push(`${s.units} at ${signed(s.from)}${last ? ' and up' : ''}`);
  });
  return `${parts.join(', ')}.`;
}

export type BetVerdict = 'right' | 'over' | 'under';

export interface BetGrade {
  verdict: BetVerdict;
  expectedUnits: number;
  chosenUnits: number;
  explanation: string;
}

/** Compares a bet with the spread at this true count. */
export function gradeBet(spread: BetSpread, trueCount: number, chosenUnits: number, unitPotatoes: number): BetGrade {
  const expectedUnits = unitsFor(spread, trueCount);
  const verdict: BetVerdict = chosenUnits === expectedUnits ? 'right' : chosenUnits > expectedUnits ? 'over' : 'under';
  const p = (u: number) => `${u} unit${u === 1 ? '' : 's'} (${u * unitPotatoes} potatoes)`;
  const head = `At a true count of ${signed(trueCount)} your spread says ${p(expectedUnits)}.`;
  const tail = verdict === 'right'
    ? ''
    : verdict === 'over'
      ? ` You bet ${p(chosenUnits)}: over-betting. Betting more than the spread raises your risk of losing your bankroll without adding enough edge to pay for it.`
      : ` You bet ${p(chosenUnits)}: under-betting. When the count is good the extra bet is where the edge comes from; betting less gives it away.`;
  return { verdict, expectedUnits, chosenUnits, explanation: head + tail };
}
