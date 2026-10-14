import type { Pip } from '../cards';
import { type Composition, cardsIn, probabilities, removeCards } from './composition';

/** Index of dealer outcomes: 0..4 are final totals 17..21, 5 is bust. */
export const BUST = 5;

export interface DealerModel {
  /** Distribution of the dealer's final total, given the dealer does not have blackjack. */
  final: number[];
  /** Probability the hole card gives the dealer blackjack (before any peek). */
  pBlackjack: number;
  /**
   * Distribution of the next card the player draws, given the dealer does not have blackjack.
   * Knowing the hole card isn't a ten (under an Ace) slightly enriches the rest of the shoe in tens.
   */
  playerDraw: number[];
}

function dealerHasBlackjack(up: Pip, hole: number): boolean {
  return (up === 1 && hole === 10) || (up === 10 && hole === 1);
}

function finalFrom(
  sum: number,
  hasAce: boolean,
  q: number[],
  hitSoft17: boolean,
  memo: Map<number, number[]>,
): number[] {
  const key = sum * 2 + (hasAce ? 1 : 0);
  const cached = memo.get(key);
  if (cached) return cached;
  const out = new Array<number>(6).fill(0);
  const soft = hasAce && sum + 10 <= 21;
  const eff = soft ? sum + 10 : sum;
  if (eff > 21) {
    out[BUST] = 1;
  } else if (eff >= 17 && !(eff === 17 && soft && hitSoft17)) {
    out[eff - 17] = 1;
  } else {
    for (let r = 1; r <= 10; r++) {
      const p = q[r];
      if (p === 0) continue;
      const d = finalFrom(sum + r, hasAce || r === 1, q, hitSoft17, memo);
      for (let i = 0; i < 6; i++) out[i] += p * d[i];
    }
  }
  memo.set(key, out);
  return out;
}

/**
 * Dealer outcome model for one upcard and the shoe left after the known cards are removed.
 *
 * Method: the hole card is drawn from the exact remaining shoe and conditioned on "no blackjack".
 * After the hole card, the dealer's and the player's draws use the shoe with the hole card removed, held
 * fixed while drawing (the cards drawn during the hand are not removed one by one). This keeps the
 * removal effect of the player's cards, the upcard and the hole card, which is what makes strategy depend on
 * the number of decks, while staying fast enough to compute a full chart in the browser.
 */
export function dealerModel(upcard: Pip, comp: Composition, hitSoft17: boolean): DealerModel {
  const n = cardsIn(comp);
  const pBlackjack = upcard === 1 ? comp[10] / n : upcard === 10 ? comp[1] / n : 0;
  const final = new Array<number>(6).fill(0);
  const playerDraw = new Array<number>(11).fill(0);
  let mass = 0;
  for (let hole = 1; hole <= 10; hole++) {
    if (comp[hole] === 0 || dealerHasBlackjack(upcard, hole)) continue;
    const pHole = comp[hole] / n;
    mass += pHole;
    const q = probabilities(removeCards(comp, [hole]));
    const d = finalFrom(upcard + hole, upcard === 1 || hole === 1, q, hitSoft17, new Map());
    for (let i = 0; i < 6; i++) final[i] += pHole * d[i];
    for (let r = 1; r <= 10; r++) playerDraw[r] += pHole * q[r];
  }
  for (let i = 0; i < 6; i++) final[i] /= mass;
  for (let r = 1; r <= 10; r++) playerDraw[r] /= mass;
  return { final, pBlackjack, playerDraw };
}
