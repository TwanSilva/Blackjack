import { type Card, cardPip } from './cards';
import { handValue, isPair } from './hand';
import type { Rules } from './rules';

export type Action = 'hit' | 'stand' | 'double' | 'split' | 'surrender';

export const ACTION_LABEL: Record<Action, string> = {
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double',
  split: 'Split',
  surrender: 'Surrender',
};

/** Where a hand sits in a round. A fresh two-card hand has an empty context. */
export interface HandContext {
  /** The hand came from a split. */
  fromSplit?: boolean;
  /** How many hands the player holds right now (1 before any split). */
  hands?: number;
  /** The hand is a split ace: it gets one card and no further action, except resplitting if allowed. */
  splitAces?: boolean;
}

export function doubleTotalAllowed(total: number, rules: Pick<Rules, 'doubleOn'>): boolean {
  if (rules.doubleOn === 'any') return true;
  if (rules.doubleOn === '9-11') return total >= 9 && total <= 11;
  return total >= 10 && total <= 11;
}

export function canDouble(cards: readonly Card[], rules: Rules, ctx: HandContext = {}): boolean {
  if (cards.length !== 2 || ctx.splitAces) return false;
  if (ctx.fromSplit && !rules.doubleAfterSplit) return false;
  return doubleTotalAllowed(handValue(cards).total, rules);
}

export function canSplit(cards: readonly Card[], rules: Rules, ctx: HandContext = {}): boolean {
  if (!isPair(cards)) return false;
  if ((ctx.hands ?? 1) >= rules.maxSplitHands) return false;
  if (ctx.fromSplit && cardPip(cards[0]) === 1 && !rules.resplitAces) return false;
  return true;
}

export function canSurrender(cards: readonly Card[], rules: Rules, ctx: HandContext = {}): boolean {
  return rules.surrender === 'late' && cards.length === 2 && !ctx.fromSplit;
}

export function availableActions(cards: readonly Card[], rules: Rules, ctx: HandContext = {}): Action[] {
  if (handValue(cards).total >= 21 && !isPair(cards)) return ['stand'];
  const out: Action[] = [];
  if (ctx.splitAces && cards.length === 2) {
    out.push('stand');
  } else {
    out.push('hit', 'stand');
    if (canDouble(cards, rules, ctx)) out.push('double');
  }
  if (canSplit(cards, rules, ctx)) out.push('split');
  if (canSurrender(cards, rules, ctx)) out.push('surrender');
  return out;
}
