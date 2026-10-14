import { type Card, cardPip } from './cards';

export interface HandValue {
  /** Best total: an ace counts 11 when that doesn't bust. */
  total: number;
  /** True when an ace is being counted as 11. */
  soft: boolean;
}

export function pipsValue(pips: readonly number[]): HandValue {
  let sum = 0;
  let hasAce = false;
  for (const p of pips) {
    sum += p;
    if (p === 1) hasAce = true;
  }
  const soft = hasAce && sum + 10 <= 21;
  return { total: soft ? sum + 10 : sum, soft };
}

export function handValue(cards: readonly Card[]): HandValue {
  return pipsValue(cards.map(cardPip));
}

export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: readonly Card[]): boolean {
  return handValue(cards).total > 21;
}

/** Two cards of the same strategy value. Any two ten-valued cards count as a pair. */
export function isPair(cards: readonly Card[]): boolean {
  return cards.length === 2 && cardPip(cards[0]) === cardPip(cards[1]);
}
