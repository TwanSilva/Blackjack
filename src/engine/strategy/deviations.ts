import type { Action } from '../actions';
import type { Pip } from '../cards';
import { ROUNDING_LABEL, type TrueCountRounding } from '../counting/count';
import { type HandClass, classLabel, hardClass, pairClass } from './classes';
import { pipName } from '../cards';

/**
 * Hi-Lo play deviations: the Illustrious 18, the Fab 4 surrenders, and insurance.
 *
 * WARNING: these numbers are UNVERIFIED. They were typed from memory by the AI that wrote this code. They are
 * the values commonly quoted for Don Schlesinger's lists in "Blackjack Attack", but they have not been checked
 * against the book or against any computed source. Which true count rounding they assume has not been checked
 * either: floor is an assumption. Verify every row (or replace the table with a cited source) before relying
 * on it. Only the insurance row is used by the strategy oracle so far; the others are data for build step 6.
 */

export interface IndexSource {
  id: string;
  title: string;
  /** Where the numbers came from, in plain words. */
  provenance: string;
  /** True only once every number has been checked against a cited source. */
  verified: boolean;
  /** The true count rounding the numbers assume. */
  rounding: TrueCountRounding;
  /** True only once the rounding has been checked against the source. */
  roundingVerified: boolean;
  /** The game the numbers are quoted for. */
  game: string;
}

export const MEMORY_HILO_SOURCE: IndexSource = {
  id: 'memory-hilo-i18-fab4',
  title: 'Illustrious 18, Fab 4 and insurance (Hi-Lo)',
  provenance:
    'Typed from memory by the AI that wrote this code: the values commonly quoted for Don Schlesinger\'s lists in "Blackjack Attack". Not checked against the book or any computed source.',
  verified: false,
  rounding: 'floor',
  roundingVerified: false,
  game: 'Multi-deck shoe, dealer stands on soft 17, as the lists are usually quoted. Not checked for H17 games.',
};

export type DeviationGroup = 'insurance' | 'illustrious18' | 'fab4';
export type IndexPlay = Action | 'insurance' | 'no-insurance';

export interface DeviationIndex {
  id: string;
  group: DeviationGroup;
  /** Null for insurance, which depends only on the dealer's Ace. */
  hand: HandClass | null;
  upcard: Pip;
  /** The index: play `atOrAbove` when the true count is at or above it, `below` otherwise. */
  index: number;
  atOrAbove: IndexPlay;
  below: IndexPlay;
  source: IndexSource;
}

const S = MEMORY_HILO_SOURCE;
const row = (
  id: string, group: DeviationGroup, hand: HandClass | null, upcard: Pip, index: number, atOrAbove: IndexPlay, below: IndexPlay,
): DeviationIndex => ({ id, group, hand, upcard, index, atOrAbove, below, source: S });

/** In the usual Illustrious 18 order, then the Fab 4. Unverified: see the warning at the top of this file. */
export const DEVIATIONS: readonly DeviationIndex[] = [
  row('insurance', 'insurance', null, 1, 3, 'insurance', 'no-insurance'),
  row('16v10', 'illustrious18', hardClass(16), 10, 0, 'stand', 'hit'),
  row('15v10', 'illustrious18', hardClass(15), 10, 4, 'stand', 'hit'),
  row('TTv5', 'illustrious18', pairClass(10), 5, 5, 'split', 'stand'),
  row('TTv6', 'illustrious18', pairClass(10), 6, 4, 'split', 'stand'),
  row('10v10', 'illustrious18', hardClass(10), 10, 4, 'double', 'hit'),
  row('12v3', 'illustrious18', hardClass(12), 3, 2, 'stand', 'hit'),
  row('12v2', 'illustrious18', hardClass(12), 2, 3, 'stand', 'hit'),
  row('11vA', 'illustrious18', hardClass(11), 1, 1, 'double', 'hit'),
  row('9v2', 'illustrious18', hardClass(9), 2, 1, 'double', 'hit'),
  row('10vA', 'illustrious18', hardClass(10), 1, 4, 'double', 'hit'),
  row('9v7', 'illustrious18', hardClass(9), 7, 3, 'double', 'hit'),
  row('16v9', 'illustrious18', hardClass(16), 9, 5, 'stand', 'hit'),
  row('13v2', 'illustrious18', hardClass(13), 2, -1, 'stand', 'hit'),
  row('12v4', 'illustrious18', hardClass(12), 4, 0, 'stand', 'hit'),
  row('12v5', 'illustrious18', hardClass(12), 5, -2, 'stand', 'hit'),
  row('12v6', 'illustrious18', hardClass(12), 6, -1, 'stand', 'hit'),
  row('13v3', 'illustrious18', hardClass(13), 3, -2, 'stand', 'hit'),
  row('14v10sur', 'fab4', hardClass(14), 10, 3, 'surrender', 'hit'),
  row('15v10sur', 'fab4', hardClass(15), 10, 0, 'surrender', 'hit'),
  row('15v9sur', 'fab4', hardClass(15), 9, 2, 'surrender', 'hit'),
  row('15vAsur', 'fab4', hardClass(15), 1, 1, 'surrender', 'hit'),
];

export const INSURANCE_DEVIATION: DeviationIndex = DEVIATIONS.find((d) => d.group === 'insurance')!;

/** "Hard 16 vs 10: stand at 0 or higher, hit below." */
export function describeDeviation(d: DeviationIndex): string {
  const play = (p: IndexPlay) => (p === 'insurance' ? 'take insurance' : p === 'no-insurance' ? 'decline insurance' : p);
  const at = d.index > 0 ? `+${d.index}` : d.index < 0 ? `−${-d.index}` : '0';
  const what = d.hand ? `${classLabel(d.hand)} vs ${pipName(d.upcard)}` : `Insurance vs ${pipName(d.upcard)}`;
  return `${what}: ${play(d.atOrAbove)} at ${at} or higher, ${play(d.below)} below.`;
}

/** Plain status of a source, for showing next to its numbers. */
export function sourceStatus(s: IndexSource): string {
  const numbers = s.verified ? 'Verified' : 'Unverified: written from memory, not checked against a source';
  const rounding = s.roundingVerified
    ? `assumes ${ROUNDING_LABEL[s.rounding].toLowerCase()} true counts`
    : `assumed to use ${ROUNDING_LABEL[s.rounding].toLowerCase()} true counts (not checked)`;
  return `${numbers}; ${rounding}.`;
}

/**
 * Null when the player's rounding matches the one the index numbers assume. Otherwise a warning: the
 * trainer does not apply the indices with a mismatched rounding, because they can be off by one.
 */
export function roundingMismatch(s: IndexSource, playerRounding: TrueCountRounding): string | null {
  if (playerRounding === s.rounding) return null;
  return `The index numbers assume ${ROUNDING_LABEL[s.rounding].toLowerCase()} true counts, but your rounding is set to ${ROUNDING_LABEL[playerRounding].toLowerCase()}. Count-based plays are not applied until these match.`;
}
