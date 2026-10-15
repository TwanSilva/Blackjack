import type { Action } from '../actions';
import type { Pip } from '../cards';
import { ROUNDING_LABEL, type TrueCountRounding } from '../counting/count';
import { signed } from '../counting/systems';
import type { Rules } from '../rules';
import { type HandClass, classKey } from './classes';
import { type DeviationIndex, DEVIATIONS, describeDeviation, deviationMismatch } from './deviations';
import type { OptionEval } from './evaluate';

/** A count index that took part in a decision. */
export interface AppliedDeviation {
  row: DeviationIndex;
  /** The index used: the row's in-game index for hands of three or more cards, when it has one. */
  index: number;
  /** The play this row gives at the true count. */
  play: Action;
  /** True when the in-game index was used (three or more cards). */
  inGame: boolean;
}

export interface CountDecision {
  best: Action;
  /** The rows that decided it, surrender row first. Empty when no row covers this hand. */
  applied: AppliedDeviation[];
  /** Set when a row covers the hand but can't be applied (rules or rounding mismatch); `best` is basic then. */
  warning: string | null;
}

/** The rows that cover a hand: same total and kind (hard, soft or pair) against the same upcard. */
export function deviationsFor(cls: HandClass, upcard: Pip): DeviationIndex[] {
  const key = classKey(cls);
  return DEVIATIONS.filter((d) => d.hand !== null && classKey(d.hand) === key && d.upcard === upcard);
}

/**
 * Basic strategy adjusted for the true count, from the verified index table.
 *
 * 1. Surrender first, as at the table. If surrender is allowed and a Fab 4 row covers the hand, surrender at or
 *    above its index and not below. Without a Fab 4 row, keep basic strategy's surrender decision.
 * 2. Otherwise start from the best non-surrender play, and if an Illustrious 18 row covers the hand and its
 *    play is allowed here, the row decides: its at-or-above play at or above the index, its other play below.
 *    Hands of three or more cards use the row's in-game index when it has one.
 *
 * `options` are the allowed plays with their (count-neutral) EVs, best first, as the oracle computes them.
 */
export function decideWithCount(
  options: readonly OptionEval[],
  cls: HandClass,
  upcard: Pip,
  rules: Rules,
  trueCount: number,
  rounding: TrueCountRounding,
  cardCount: number,
): CountDecision {
  const basic = options[0].action;
  const rows = deviationsFor(cls, upcard);
  if (rows.length === 0) return { best: basic, applied: [], warning: null };
  const warning = rows.map((d) => deviationMismatch(d, rounding, rules)).find((w) => w !== null) ?? null;
  if (warning) return { best: basic, applied: [], warning };

  const allowed = new Set(options.map((o) => o.action));
  const applied: AppliedDeviation[] = [];

  if (allowed.has('surrender')) {
    const fab = rows.find((d) => d.group === 'fab4');
    if (fab) {
      const surrender = trueCount >= fab.index;
      applied.push({ row: fab, index: fab.index, play: surrender ? 'surrender' : (fab.below as Action), inGame: false });
      if (surrender) return { best: 'surrender', applied, warning: null };
    } else if (basic === 'surrender') {
      return { best: 'surrender', applied, warning: null };
    }
  }

  let best = options.find((o) => o.action !== 'surrender')!.action;
  const play = rows.find((d) => d.group === 'illustrious18');
  if (play) {
    const inGame = cardCount > 2 && play.inGameIndex !== undefined;
    const index = inGame ? play.inGameIndex! : play.index;
    const chosen = (trueCount >= index ? play.atOrAbove : play.below) as Action;
    if (allowed.has(chosen) && allowed.has(play.atOrAbove as Action) && allowed.has(play.below as Action)) {
      applied.push({ row: play, index, play: chosen, inGame });
      best = chosen;
    }
  }
  // A Fab 4 row that said "don't surrender" hands over to the playing decision.
  if (applied.length && applied[applied.length - 1].row.group === 'fab4') {
    applied[applied.length - 1] = { ...applied[applied.length - 1], play: best };
  }
  return { best, applied, warning: null };
}

const VERB: Record<Action, string> = {
  hit: 'hit', stand: 'stand', double: 'double', split: 'split', surrender: 'surrender',
};

/**
 * Plain explanation of a count-based decision, built from the table: which index applied, which side of it
 * the count is on, and what basic strategy would do.
 */
export function explainCountDecision(
  decision: CountDecision,
  basic: Action,
  trueCount: number,
  rounding: TrueCountRounding,
): string {
  if (decision.warning) return decision.warning;
  if (decision.applied.length === 0) return `No count index covers this hand, so play basic strategy: ${VERB[basic]}.`;
  const parts: string[] = [];
  for (const a of decision.applied) {
    const side = trueCount >= a.index ? 'at or above' : 'below';
    const index = a.index > 0 ? `+${a.index}` : a.index < 0 ? `−${-a.index}` : '0';
    parts.push(`${describeDeviation({ ...a.row, index: a.index })} True count ${signed(trueCount)} is ${side} ${index}.`);
    if (a.inGame) parts.push('That is the index for three or more cards: with late surrender, two-card hands are surrendered.');
    if (a.row.confidence === 'close') parts.push('This index is a close call: near it, either play costs very little.');
  }
  parts.push(decision.best === basic
    ? `So ${VERB[decision.best]}, the same as basic strategy.`
    : `So ${VERB[decision.best]}; basic strategy would ${VERB[basic]}.`);
  parts.push(`(Counts are ${ROUNDING_LABEL[rounding].toLowerCase()}.)`);
  return parts.join(' ');
}
