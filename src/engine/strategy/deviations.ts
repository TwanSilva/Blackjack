import type { Action } from '../actions';
import { type Pip, pipName } from '../cards';
import { ROUNDING_LABEL, type TrueCountRounding } from '../counting/count';
import { DEFAULT_RULES, type Rules, rulesDescription, strategyKey } from '../rules';
import { type HandClass, classLabel, hardClass, pairClass } from './classes';

/**
 * Hi-Lo play deviations: the Illustrious 18, the Fab 4 surrenders, and insurance.
 *
 * The index numbers come from this repo's Monte Carlo simulation (src/engine/sim/indexSim.ts, run with
 * `npm run sim -- 20000000 h17`) for one rule set: the default 8-deck H17 game below, with floor rounding. The run's
 * summary is in docs/sim-indices-h17.json and the comparison in docs/index-comparison.md. They are only valid for
 * that rule set and that rounding; anything else gets a warning and the indices are not applied.
 *
 * `memoryIndex` keeps the earlier values, typed from memory and never verified, as a reference only.
 */

export interface IndexSource {
  id: string;
  title: string;
  /** Where the numbers came from, in plain words. */
  provenance: string;
  /** True once every number has been checked: here, by simulation. */
  verified: boolean;
  /** How they were checked. */
  verification: 'simulation' | 'none';
  /** The true count rounding the numbers assume. */
  rounding: TrueCountRounding;
  /** True once the rounding has been checked against the source. */
  roundingVerified: boolean;
  /** The rules the numbers were produced for; null when unknown. */
  rules: Rules | null;
  /** The game, in plain words. */
  game: string;
}

/** The rules the simulation was run with: the trainer's default table. */
const SIM_RULES: Rules = { ...DEFAULT_RULES };

export const SIM_H17_SOURCE: IndexSource = {
  id: 'sim-h17-8d-2026-10-15',
  title: 'Hi-Lo indices simulated for 8 decks, H17',
  provenance:
    'Monte Carlo simulation in this repo (src/engine/sim/indexSim.ts), 20,000,160 shuffled shoes, run on 2026-10-15. Real shoes, multi-card hands, both plays from the same cards, gains by floored true count. Summary in docs/sim-indices-h17.json.',
  verified: true,
  verification: 'simulation',
  rounding: 'floor',
  roundingVerified: true,
  rules: SIM_RULES,
  game: rulesDescription(SIM_RULES),
};

/** The earlier table, kept only as a reference column. */
export const MEMORY_HILO_SOURCE: IndexSource = {
  id: 'memory-hilo-i18-fab4',
  title: 'Illustrious 18, Fab 4 and insurance (Hi-Lo), from memory',
  provenance:
    'Typed from memory by the AI that wrote this code: the values commonly quoted for Don Schlesinger\'s lists in "Blackjack Attack". Not checked against the book. The S17 simulation matches 18 of 22 of them.',
  verified: false,
  verification: 'none',
  rounding: 'floor',
  roundingVerified: false,
  rules: null,
  game: 'Multi-deck shoe, dealer stands on soft 17, as the lists are usually quoted.',
};

export type DeviationGroup = 'insurance' | 'illustrious18' | 'fab4';
export type IndexPlay = Action | 'insurance' | 'no-insurance';

export interface DeviationIndex {
  id: string;
  group: DeviationGroup;
  /** Null for insurance, which depends only on the dealer's Ace. */
  hand: HandClass | null;
  upcard: Pip;
  /** The index: play `atOrAbove` when the floored true count is at or above it, `below` otherwise. */
  index: number;
  atOrAbove: IndexPlay;
  below: IndexPlay;
  source: IndexSource;
  /**
   * 'clear': at the index the deviation wins, and one below it the other play wins, both by 2+ standard errors.
   * 'close': one of those two is within 2 standard errors of break-even, so the index could be one off; either
   * choice costs very little in that count.
   */
  confidence: 'clear' | 'close';
  /**
   * The index when two-card hands that basic strategy surrenders are left out, if different: with late
   * surrender this is how the stand/hit decision actually comes up.
   */
  inGameIndex?: number;
  /** The old value from memory, for reference only. Never applied. */
  memoryIndex: number;
  /**
   * False for insurance: it pays when the hole card is a ten, so it depends only on the share of tens left,
   * which the true count measures, not on the playing rules. Both the H17 and the S17 simulation give +3.
   * Every playing deviation is true: those numbers change with the rules (11 vs Ace is −1 under H17, +1 under S17).
   */
  rulesDependent: boolean;
}

const S = SIM_H17_SOURCE;
const row = (
  id: string, group: DeviationGroup, hand: HandClass | null, upcard: Pip, index: number, atOrAbove: IndexPlay,
  below: IndexPlay, confidence: 'clear' | 'close', memoryIndex: number, inGameIndex?: number,
): DeviationIndex => ({
  id, group, hand, upcard, index, atOrAbove, below, source: S, confidence, memoryIndex, rulesDependent: group !== 'insurance',
  ...(inGameIndex !== undefined ? { inGameIndex } : {}),
});

/** In the usual Illustrious 18 order, then the Fab 4. Index = simulated, H17, floor. */
export const DEVIATIONS: readonly DeviationIndex[] = [
  row('insurance', 'insurance', null, 1, 3, 'insurance', 'no-insurance', 'clear', 3),
  row('16v10', 'illustrious18', hardClass(16), 10, 0, 'stand', 'hit', 'clear', 0),
  row('15v10', 'illustrious18', hardClass(15), 10, 4, 'stand', 'hit', 'clear', 4),
  row('TTv5', 'illustrious18', pairClass(10), 5, 5, 'split', 'stand', 'clear', 5),
  row('TTv6', 'illustrious18', pairClass(10), 6, 4, 'split', 'stand', 'clear', 4),
  row('10v10', 'illustrious18', hardClass(10), 10, 4, 'double', 'hit', 'close', 4),
  row('12v3', 'illustrious18', hardClass(12), 3, 1, 'stand', 'hit', 'clear', 2),
  row('12v2', 'illustrious18', hardClass(12), 2, 3, 'stand', 'hit', 'clear', 3),
  row('11vA', 'illustrious18', hardClass(11), 1, -1, 'double', 'hit', 'clear', 1),
  row('9v2', 'illustrious18', hardClass(9), 2, 1, 'double', 'hit', 'clear', 1),
  row('10vA', 'illustrious18', hardClass(10), 1, 3, 'double', 'hit', 'clear', 4),
  row('9v7', 'illustrious18', hardClass(9), 7, 4, 'double', 'hit', 'close', 3),
  row('16v9', 'illustrious18', hardClass(16), 9, 5, 'stand', 'hit', 'close', 5, 4),
  row('13v2', 'illustrious18', hardClass(13), 2, -1, 'stand', 'hit', 'clear', -1),
  row('12v4', 'illustrious18', hardClass(12), 4, 0, 'stand', 'hit', 'clear', 0),
  row('12v5', 'illustrious18', hardClass(12), 5, -2, 'stand', 'hit', 'clear', -2),
  row('12v6', 'illustrious18', hardClass(12), 6, -3, 'stand', 'hit', 'close', -1),
  row('13v3', 'illustrious18', hardClass(13), 3, -2, 'stand', 'hit', 'close', -2),
  row('14v10sur', 'fab4', hardClass(14), 10, 3, 'surrender', 'hit', 'clear', 3),
  row('15v10sur', 'fab4', hardClass(15), 10, 0, 'surrender', 'hit', 'clear', 0),
  row('15v9sur', 'fab4', hardClass(15), 9, 2, 'surrender', 'hit', 'close', 2),
  row('15vAsur', 'fab4', hardClass(15), 1, -1, 'surrender', 'hit', 'clear', 1),
];

export const INSURANCE_DEVIATION: DeviationIndex = DEVIATIONS.find((d) => d.group === 'insurance')!;

function signedIndex(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}

/** "Hard 16 vs 10: stand at 0 or higher, hit below." */
export function describeDeviation(d: DeviationIndex): string {
  const play = (p: IndexPlay) => (p === 'insurance' ? 'take insurance' : p === 'no-insurance' ? 'decline insurance' : p);
  const what = d.hand ? `${classLabel(d.hand)} vs ${pipName(d.upcard)}` : `Insurance vs ${pipName(d.upcard)}`;
  return `${what}: ${play(d.atOrAbove)} at ${signedIndex(d.index)} or higher, ${play(d.below)} below.`;
}

/** Plain status of a source, for showing next to its numbers. */
export function sourceStatus(s: IndexSource): string {
  const numbers = s.verification === 'simulation'
    ? `Verified by simulation for ${s.game}`
    : 'Unverified: written from memory, not checked against a source';
  const rounding = s.roundingVerified
    ? `${ROUNDING_LABEL[s.rounding].toLowerCase()} true counts`
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

/**
 * Null when the table rules match the rules the index numbers were produced for (penetration aside, which
 * doesn't change strategy). Otherwise a warning, and the indices are not applied: several numbers differ by
 * rule set, for example 11 vs Ace is −1 under H17 and +1 under S17.
 */
export function rulesMismatch(s: IndexSource, rules: Rules): string | null {
  if (!s.rules || strategyKey(s.rules) === strategyKey(rules)) return null;
  return `The index numbers were simulated for ${s.game}. Your table rules are different, so the playing deviations are not applied (insurance still is: it doesn't depend on the rules). Run the simulation for your rules to get indices for them.`;
}

/** Every reason one row can't be applied, joined, or null when it can. Insurance ignores the playing rules. */
export function deviationMismatch(d: DeviationIndex, playerRounding: TrueCountRounding, rules: Rules): string | null {
  const reasons = [d.rulesDependent ? rulesMismatch(d.source, rules) : null, roundingMismatch(d.source, playerRounding)]
    .filter((x): x is string => x !== null);
  return reasons.length ? reasons.join(' ') : null;
}

/** Every reason the table's playing deviations can't be applied, joined, or null when they can. */
export function indexMismatch(s: IndexSource, playerRounding: TrueCountRounding, rules: Rules): string | null {
  const reasons = [rulesMismatch(s, rules), roundingMismatch(s, playerRounding)].filter((x): x is string => x !== null);
  return reasons.length ? reasons.join(' ') : null;
}
