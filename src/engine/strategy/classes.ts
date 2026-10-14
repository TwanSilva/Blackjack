import type { Pip } from '../cards';
import { pipName } from '../cards';
import { pipsValue } from '../hand';

export type HandKind = 'hard' | 'soft' | 'pair';

/**
 * A two-card hand as the chart sees it. Basic strategy is total-dependent: every two-card hand with the
 * same kind and total gets the same play, and the EV of the class is the probability-weighted average
 * over the card combinations that make it.
 */
export interface HandClass {
  kind: HandKind;
  /** Best total of the two cards. */
  total: number;
  /** For pairs: the value of each card (1 = Ace, 10 = ten-valued). */
  pip?: Pip;
}

export const UPCARDS: readonly Pip[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
/** Hard two-card totals that can be made without a pair. */
export const HARD_TOTALS: readonly number[] = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
/** Soft two-card totals: A,2 (13) to A,9 (20). A,10 is a blackjack. */
export const SOFT_TOTALS: readonly number[] = [13, 14, 15, 16, 17, 18, 19, 20];
export const PAIR_PIPS: readonly Pip[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];

export function hardClass(total: number): HandClass {
  return { kind: 'hard', total };
}
export function softClass(total: number): HandClass {
  return { kind: 'soft', total };
}
export function pairClass(pip: Pip): HandClass {
  return { kind: 'pair', total: pip === 1 ? 12 : pip * 2, pip };
}

export function classifyPips(a: Pip, b: Pip): HandClass {
  if (a === b) return pairClass(a);
  const v = pipsValue([a, b]);
  return v.soft ? softClass(v.total) : hardClass(v.total);
}

export function classKey(c: HandClass): string {
  return c.kind === 'pair' ? `pair-${c.pip}` : `${c.kind}-${c.total}`;
}

/** "Hard 13", "Soft 18", "Pair of 8s", "Pair of Aces". */
export function classLabel(c: HandClass): string {
  if (c.kind === 'pair') return c.pip === 1 ? 'Pair of Aces' : `Pair of ${c.pip}s`;
  return `${c.kind === 'hard' ? 'Hard' : 'Soft'} ${c.total}`;
}

/** Chart row label: "13", "A,7", "8,8". */
export function rowLabel(c: HandClass): string {
  if (c.kind === 'pair') {
    const n = pipName(c.pip!) === 'Ace' ? 'A' : String(c.pip);
    return `${n},${n}`;
  }
  if (c.kind === 'soft') return `A,${c.total - 11}`;
  return String(c.total);
}

/** The total a pair is played as when it isn't split, for example "hard 16" or "soft 12". */
export function pairTotalPhrase(pip: Pip): string {
  return pip === 1 ? 'soft 12' : `hard ${pip * 2}`;
}

/** The two-card combinations that make a class. */
export function compositions(c: HandClass): [Pip, Pip][] {
  if (c.kind === 'pair') return [[c.pip!, c.pip!]];
  if (c.kind === 'soft') return [[1, (c.total - 11) as Pip]];
  const out: [Pip, Pip][] = [];
  for (let a = 2; a <= 10; a++) {
    const b = c.total - a;
    if (b > a && b <= 10) out.push([a as Pip, b as Pip]);
  }
  return out;
}

export function allClasses(): HandClass[] {
  return [
    ...HARD_TOTALS.map(hardClass),
    ...SOFT_TOTALS.map(softClass),
    ...PAIR_PIPS.map(pairClass),
  ];
}
