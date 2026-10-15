import type { Card } from '../cards';
import { type CountSystem, HI_LO, countValue, signed } from './systems';

export function runningCount(cards: readonly Card[], system: CountSystem = HI_LO): number {
  let rc = 0;
  for (const c of cards) rc += countValue(c, system);
  return rc;
}

/**
 * True count rounding: the engine setting for how running count ÷ decks becomes a whole number.
 * - floor (default): toward negative infinity. +2.8 is +2, −1.5 is −2.
 * - nearest: the nearest whole number, halves away from zero. +2.8 is +3, −1.5 is −2, +2.5 is +3.
 * - truncate: toward zero. +2.8 is +2, −1.5 is −1.
 * Index numbers are only correct for the rounding they were generated with; see strategy/deviations.ts.
 */
export type TrueCountRounding = 'floor' | 'nearest' | 'truncate';

export const TRUE_COUNT_ROUNDINGS: readonly TrueCountRounding[] = ['floor', 'nearest', 'truncate'];

export const DEFAULT_TC_ROUNDING: TrueCountRounding = 'floor';

export const ROUNDING_LABEL: Record<TrueCountRounding, string> = {
  floor: 'Round down',
  nearest: 'Nearest',
  truncate: 'Toward zero',
};

export const ROUNDING_DESCRIPTION: Record<TrueCountRounding, string> = {
  floor: 'Toward negative infinity: +2.8 is +2, −1.5 is −2.',
  nearest: 'Nearest whole number, halves away from zero: +2.8 is +3, −1.5 is −2.',
  truncate: 'Toward zero: +2.8 is +2, −1.5 is −1.',
};

/** Reads a stored or imported value, mapping the old name 'round' to 'nearest'. Unknown values give the default. */
export function parseRounding(value: unknown): TrueCountRounding {
  if (value === 'round') return 'nearest';
  return TRUE_COUNT_ROUNDINGS.includes(value as TrueCountRounding) ? (value as TrueCountRounding) : DEFAULT_TC_ROUNDING;
}

/** Decks remaining rounded to the nearest half deck, never below half a deck. The divisor for every true count. */
export function roundDecks(decksRemaining: number): number {
  if (!(decksRemaining > 0)) throw new Error('Decks remaining must be more than 0');
  return Math.max(0.5, Math.round(decksRemaining * 2) / 2);
}

/** Decks remaining from a card count, to the nearest half deck. */
export function estimateDecks(cardsRemaining: number): number {
  return cardsRemaining > 0 ? roundDecks(cardsRemaining / 52) : 0.5;
}

/** Running count ÷ decks remaining (rounded to the half deck), before rounding to a whole number. */
export function exactTrueCount(running: number, decksRemaining: number): number {
  return running / roundDecks(decksRemaining);
}

/** Rounds a fractional true count with the chosen rounding. */
export function roundTrueCount(x: number, rounding: TrueCountRounding): number {
  // Guard against 2.9999999999999996 from floating point division.
  const v = Math.round(x * 1e9) / 1e9;
  let out: number;
  if (rounding === 'floor') out = Math.floor(v);
  else if (rounding === 'truncate') out = Math.trunc(v);
  else out = Math.sign(v) * Math.round(Math.abs(v));
  return out === 0 ? 0 : out; // never −0
}

/** True count: decks rounded to the nearest half deck, then running count ÷ decks, then rounded. */
export function trueCount(running: number, decksRemaining: number, rounding: TrueCountRounding = DEFAULT_TC_ROUNDING): number {
  return roundTrueCount(exactTrueCount(running, decksRemaining), rounding);
}

function decksText(d: number): string {
  const s = Number.isInteger(d) ? String(d) : d.toFixed(d * 2 === Math.round(d * 2) ? 1 : 2);
  return `${s} deck${d === 1 ? '' : 's'}`;
}

/** "+7 ÷ 3.5 decks = +2.0, rounded down: +2." The decks shown are the half-deck figure actually divided by. */
export function explainTrueCount(running: number, decksRemaining: number, rounding: TrueCountRounding): string {
  const decks = roundDecks(decksRemaining);
  const exact = exactTrueCount(running, decks);
  const tc = trueCount(running, decks, rounding);
  const exactText = exact === 0 ? '0' : `${exact > 0 ? '+' : '−'}${Math.abs(exact).toFixed(1)}`;
  const how = rounding === 'floor' ? 'rounded down' : rounding === 'truncate' ? 'toward zero' : 'to the nearest';
  return `${signed(running)} ÷ ${decksText(decks)} = ${exactText}, ${how}: ${signed(tc)}.`;
}

/** Keeps the running count for a shoe as cards are seen. */
export class CountTracker {
  private rc = 0;
  private seen = 0;

  constructor(
    readonly decks: number,
    readonly system: CountSystem = HI_LO,
  ) {}

  see(card: Card): void {
    this.rc += countValue(card, this.system);
    this.seen++;
  }

  reset(): void {
    this.rc = 0;
    this.seen = 0;
  }

  get running(): number {
    return this.rc;
  }

  get cardsSeen(): number {
    return this.seen;
  }

  get cardsRemaining(): number {
    return this.decks * 52 - this.seen;
  }

  get decksRemaining(): number {
    return this.cardsRemaining / 52;
  }

  /** Decks remaining are rounded to the nearest half deck before dividing, like every true count. */
  trueCount(rounding: TrueCountRounding = DEFAULT_TC_ROUNDING): number {
    return trueCount(this.rc, Math.max(this.decksRemaining, 0.5), rounding);
  }
}
