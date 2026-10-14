import type { Card } from './cards';
import { handValue, isBlackjack } from './hand';
import type { Rules } from './rules';

export type HandResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'surrender';

export interface Settlement {
  result: HandResult;
  /** Net potatoes won (positive) or lost (negative). */
  net: number;
}

export interface SettleOptions {
  /** A two-card 21 after a split is not a blackjack and pays 1:1. */
  fromSplit?: boolean;
  surrendered?: boolean;
}

/** `bet` is the full amount on the hand, so pass the doubled amount for a doubled hand. */
export function settleHand(
  player: readonly Card[],
  dealer: readonly Card[],
  bet: number,
  rules: Pick<Rules, 'blackjackPays'>,
  opts: SettleOptions = {},
): Settlement {
  if (opts.surrendered) return { result: 'surrender', net: -bet / 2 };
  const p = handValue(player).total;
  if (p > 21) return { result: 'bust', net: -bet };
  const playerBJ = !opts.fromSplit && isBlackjack(player);
  const dealerBJ = isBlackjack(dealer);
  if (playerBJ && dealerBJ) return { result: 'push', net: 0 };
  if (playerBJ) return { result: 'blackjack', net: bet * rules.blackjackPays };
  if (dealerBJ) return { result: 'lose', net: -bet };
  const d = handValue(dealer).total;
  if (d > 21 || p > d) return { result: 'win', net: bet };
  if (p === d) return { result: 'push', net: 0 };
  return { result: 'lose', net: -bet };
}

/** Insurance pays 2:1 when the dealer has blackjack, otherwise the insurance bet is lost. */
export function settleInsurance(insuranceBet: number, dealerHasBlackjack: boolean): number {
  return dealerHasBlackjack ? insuranceBet * 2 : -insuranceBet;
}
