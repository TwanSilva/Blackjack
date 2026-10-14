import type { Card } from './cards';
import { handValue } from './hand';
import type { Rules } from './rules';

export function dealerMustHit(cards: readonly Card[], rules: Pick<Rules, 'hitSoft17'>): boolean {
  const { total, soft } = handValue(cards);
  if (total < 17) return true;
  return total === 17 && soft && rules.hitSoft17;
}

/** Plays the dealer hand out and returns the final cards. */
export function playDealer(cards: readonly Card[], draw: () => Card, rules: Pick<Rules, 'hitSoft17'>): Card[] {
  const out = [...cards];
  while (dealerMustHit(out, rules)) out.push(draw());
  return out;
}
