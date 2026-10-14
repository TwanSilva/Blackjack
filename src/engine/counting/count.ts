import type { Card } from '../cards';
import { type CountSystem, HI_LO, countValue, signed } from './systems';

export function runningCount(cards: readonly Card[], system: CountSystem = HI_LO): number {
  let rc = 0;
  for (const c of cards) rc += countValue(c, system);
  return rc;
}

/**
 * How a true count becomes a whole number.
 * - floor: round down (−2.5 becomes −3). The default, and the convention the index numbers will use.
 * - truncate: drop the fraction, toward zero (−2.5 becomes −2).
 * - round: to the nearest whole number, halves away from zero.
 */
export type TrueCountRounding = 'floor' | 'truncate' | 'round';

export const DEFAULT_TC_ROUNDING: TrueCountRounding = 'floor';

export const ROUNDING_LABEL: Record<TrueCountRounding, string> = {
  floor: 'Round down',
  truncate: 'Toward zero',
  round: 'Nearest',
};

export const ROUNDING_DESCRIPTION: Record<TrueCountRounding, string> = {
  floor: 'Drop to the whole number below: +2.8 is +2, −1.5 is −2.',
  truncate: 'Drop the fraction: +2.8 is +2, −1.5 is −1.',
  round: 'Nearest whole number: +2.8 is +3, −1.5 is −2.',
};

export function exactTrueCount(running: number, decksRemaining: number): number {
  if (decksRemaining <= 0) throw new Error('Decks remaining must be more than 0');
  return running / decksRemaining;
}

function roundWith(x: number, rounding: TrueCountRounding): number {
  // Guard against 2.9999999 from floating point division.
  const v = Math.round(x * 1e9) / 1e9;
  let out: number;
  if (rounding === 'floor') out = Math.floor(v);
  else if (rounding === 'truncate') out = Math.trunc(v);
  else out = Math.sign(v) * Math.round(Math.abs(v));
  return out === 0 ? 0 : out; // no −0
}

export function trueCount(running: number, decksRemaining: number, rounding: TrueCountRounding = DEFAULT_TC_ROUNDING): number {
  return roundWith(exactTrueCount(running, decksRemaining), rounding);
}

/** Decks remaining as a player estimates them: to the nearest half deck, never below half a deck. */
export function estimateDecks(cardsRemaining: number, step = 0.5): number {
  return Math.max(step, Math.round(cardsRemaining / 52 / step) * step);
}

function decksText(d: number): string {
  const s = Number.isInteger(d) ? String(d) : d.toFixed(d * 2 === Math.round(d * 2) ? 1 : 2);
  return `${s} deck${d === 1 ? '' : 's'}`;
}

/** "+7 ÷ 3.5 decks = +2.0, rounded down: +2." */
export function explainTrueCount(running: number, decksRemaining: number, rounding: TrueCountRounding): string {
  const exact = exactTrueCount(running, decksRemaining);
  const tc = trueCount(running, decksRemaining, rounding);
  const exactText = exact === 0 ? '0' : `${exact > 0 ? '+' : '−'}${Math.abs(exact).toFixed(1)}`;
  const how = rounding === 'floor' ? 'rounded down' : rounding === 'truncate' ? 'toward zero' : 'rounded';
  return `${signed(running)} ÷ ${decksText(decksRemaining)} = ${exactText}, ${how}: ${signed(tc)}.`;
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

  trueCount(rounding: TrueCountRounding = DEFAULT_TC_ROUNDING): number {
    return trueCount(this.rc, Math.max(this.decksRemaining, 0.5), rounding);
  }
}
