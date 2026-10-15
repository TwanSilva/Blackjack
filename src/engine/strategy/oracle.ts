import { type Action, type HandContext, canDouble, canSplit, canSurrender } from '../actions';
import { type Card, type Pip, cardPip } from '../cards';
import { pipsValue } from '../hand';
import type { Rules } from '../rules';
import {
  type HandClass, HARD_TOTALS, SOFT_TOTALS, classKey, classLabel, classifyPips, hardClass, softClass,
} from './classes';
import { DEFAULT_TC_ROUNDING, type TrueCountRounding } from '../counting/count';
import { type CountDecision, decideWithCount } from './countPlay';
import { type IndexSource, INSURANCE_DEVIATION, deviationMismatch } from './deviations';
import { type OptionEval, evaluateClass, evaluatePips, insuranceEv } from './evaluate';

/** Hi-Lo insurance index, from the verified deviation table. */
export const INSURANCE_INDEX = INSURANCE_DEVIATION.index;

/**
 * A true count for the oracle. A bare number is taken to be rounded with the default (floor). Pass the
 * rounding with it when the player uses a different setting, so mismatched index numbers aren't applied.
 */
export type TrueCountInput = number | { value: number; rounding: TrueCountRounding };

export interface InsuranceAdvice {
  /** Null when the count can't decide it: the rounding doesn't match the index (insurance ignores the playing rules). */
  take: boolean | null;
  index: number;
  /** Where the index number came from, and whether it is verified. */
  source: IndexSource;
  /** Set when the index was not applied because the rounding doesn't match. */
  warning: string | null;
  /** EV per unit of insurance off the top of the shoe (the count shifts it). */
  evOffTop: number;
}

export interface ChartRef {
  section: 'hard' | 'soft' | 'pairs';
  rowKey: string;
  upcard: Pip;
}

export interface Advice {
  hand: HandClass;
  handLabel: string;
  upcard: Pip;
  /** The play to make. With a true count this includes count deviations; without one it is basic strategy. */
  best: Action;
  /** Basic strategy, ignoring the count. Equals `best` when no count was given or the count changes nothing. */
  basicBest: Action;
  /** With a true count: which index rows decided the play, or why none could be applied. */
  count: CountDecision | null;
  /**
   * Every allowed option with its EV per unit bet, best first. These EVs are count-neutral (a fresh shoe):
   * with a true count, `best` can differ from options[0]; the index table decides then, not these numbers.
   */
  options: OptionEval[];
  /** 'after-peek': EVs assume the dealer has checked and has no blackjack. */
  evBasis: 'after-peek' | 'includes-dealer-blackjack';
  dealerBust: number;
  hitBust: number;
  /** Insurance advice when the dealer shows an Ace. */
  insurance: InsuranceAdvice | null;
  /** The chart cell this decision comes from, or null when the hand has no chart cell (three or more cards). */
  chart: ChartRef | null;
  /** The true count value the advice was given for, if any. */
  trueCount?: number;
}

export type UpcardInput = Card | Pip;

function toPip(u: UpcardInput): Pip {
  return typeof u === 'number' ? u : cardPip(u);
}

function chartRef(cls: HandClass, upcard: Pip): ChartRef | null {
  if (cls.kind === 'pair') return { section: 'pairs', rowKey: classKey(cls), upcard };
  if (cls.kind === 'soft' && SOFT_TOTALS.includes(cls.total)) return { section: 'soft', rowKey: classKey(cls), upcard };
  if (cls.kind === 'hard' && HARD_TOTALS.includes(cls.total)) return { section: 'hard', rowKey: classKey(cls), upcard };
  return null;
}

/** Basic-strategy advice for a hand class, the same function the chart is built from. */
export function adviseClass(cls: HandClass, upcard: Pip, rules: Rules, trueCount?: TrueCountInput): Advice {
  const e = evaluateClass(cls, upcard, rules);
  const pips: Pip[] = cls.kind === 'pair' ? [cls.pip!, cls.pip!] : cls.kind === 'soft' ? [1, (cls.total - 11) as Pip] : [];
  const count = withCount(e.options, cls, upcard, rules, trueCount, 2);
  return {
    hand: cls,
    handLabel: classLabel(cls),
    upcard,
    best: count ? count.best : e.options[0].action,
    basicBest: e.options[0].action,
    count,
    options: e.options,
    evBasis: rules.dealerPeeks ? 'after-peek' : 'includes-dealer-blackjack',
    dealerBust: e.dealerBust,
    hitBust: e.hitBust,
    insurance: insuranceAdvice(upcard, pips, rules, trueCount),
    chart: chartRef(cls, upcard),
    trueCount: countValue(trueCount),
  };
}

function countValue(tc?: TrueCountInput): number | undefined {
  return tc === undefined ? undefined : typeof tc === 'number' ? tc : tc.value;
}

function countRounding(tc: TrueCountInput): TrueCountRounding {
  return typeof tc === 'number' ? DEFAULT_TC_ROUNDING : tc.rounding;
}

/** Applies the count to basic strategy. Null when no count was given. */
function withCount(options: OptionEval[], cls: HandClass, up: Pip, rules: Rules, tc: TrueCountInput | undefined, cards: number): CountDecision | null {
  if (tc === undefined) return null;
  return decideWithCount(options, cls, up, rules, countValue(tc)!, countRounding(tc), cards);
}

function insuranceAdvice(upcard: Pip, pips: readonly Pip[], rules: Rules, tc?: TrueCountInput): InsuranceAdvice | null {
  if (upcard !== 1) return null;
  const d = INSURANCE_DEVIATION;
  const base = { index: d.index, source: d.source, evOffTop: insuranceEv(pips, rules) };
  // No count: basic strategy, which never takes insurance. That uses no index number.
  if (tc === undefined) return { ...base, take: false, warning: null };
  const warning = deviationMismatch(d, countRounding(tc), rules);
  if (warning) return { ...base, take: null, warning };
  return { ...base, take: (countValue(tc) as number) >= d.index, warning: null };
}

/**
 * The strategy oracle: best action and the EV of every allowed option.
 *
 * A fresh two-card hand gets the basic-strategy (total-dependent) answer, identical to its chart cell.
 * Hands with three or more cards, or hands after a split, are evaluated for their exact cards.
 *
 * `trueCount` (Hi-Lo, floored unless another rounding is passed with it) applies the verified index table: the
 * Fab 4 surrenders, the Illustrious 18 and insurance (see countPlay.ts). If the rules or the rounding don't match
 * the table, `best` stays basic strategy and `count.warning` says why; insurance ignores the playing rules.
 */
export function bestPlay(
  hand: readonly Card[],
  upcard: UpcardInput,
  rules: Rules,
  trueCount?: TrueCountInput,
  ctx: HandContext = {},
): Advice {
  if (hand.length < 2) throw new Error('A hand needs at least two cards');
  const up = toPip(upcard);
  const pips = hand.map(cardPip);
  const fresh = hand.length === 2 && !ctx.fromSplit;
  if (fresh) return adviseClass(classifyPips(pips[0], pips[1]), up, rules, trueCount);

  const value = pipsValue(pips);
  const cls: HandClass = pips.length === 2 && pips[0] === pips[1]
    ? classifyPips(pips[0], pips[1])
    : value.soft ? softClass(value.total) : hardClass(value.total);
  const e = evaluatePips(pips, up, rules, {
    double: canDouble(hand, rules, ctx),
    surrender: canSurrender(hand, rules, ctx),
    split: canSplit(hand, rules, ctx),
    hands: ctx.hands,
    splitAces: ctx.splitAces,
  });
  const count = withCount(e.options, cls, up, rules, trueCount, pips.length);
  return {
    hand: cls,
    handLabel: classLabel(cls),
    upcard: up,
    best: count ? count.best : e.options[0].action,
    basicBest: e.options[0].action,
    count,
    options: e.options,
    evBasis: rules.dealerPeeks ? 'after-peek' : 'includes-dealer-blackjack',
    dealerBust: e.dealerBust,
    hitBust: e.hitBust,
    insurance: insuranceAdvice(up, pips, rules, trueCount),
    chart: null,
    trueCount: countValue(trueCount),
  };
}

export function optionEv(advice: Advice, action: Action): number | undefined {
  return advice.options.find((o) => o.action === action)?.ev;
}
