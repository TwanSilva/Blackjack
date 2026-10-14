import { describe, expect, test } from 'vitest';
import {
  type Card, type Rank, DEFAULT_RULES, Shoe, availableActions, buildDecks, dealerMustHit, handValue,
  isBlackjack, isPair, playDealer, settleHand, settleInsurance,
} from '../src/engine';

const c = (rank: Rank): Card => ({ rank, suit: 'spades' });
const hand = (...ranks: Rank[]) => ranks.map(c);

describe('cards and hands', () => {
  test('hard and soft totals', () => {
    expect(handValue(hand('10', '6'))).toEqual({ total: 16, soft: false });
    expect(handValue(hand('A', '6'))).toEqual({ total: 17, soft: true });
    expect(handValue(hand('A', '6', '10'))).toEqual({ total: 17, soft: false });
    expect(handValue(hand('A', 'A', '9'))).toEqual({ total: 21, soft: true });
    expect(handValue(hand('K', 'Q', '5'))).toEqual({ total: 25, soft: false });
  });

  test('blackjack, pairs', () => {
    expect(isBlackjack(hand('A', 'K'))).toBe(true);
    expect(isBlackjack(hand('A', '5', '5'))).toBe(false);
    expect(isPair(hand('8', '8'))).toBe(true);
    expect(isPair(hand('J', 'Q'))).toBe(true);
    expect(isPair(hand('9', '8'))).toBe(false);
  });
});

describe('shoe', () => {
  test('has 52 cards per deck and a cut card at the penetration', () => {
    expect(buildDecks(8)).toHaveLength(416);
    const shoe = new Shoe(8, 0.75, () => 0.42);
    expect(shoe.size).toBe(416);
    for (let i = 0; i < 311; i++) shoe.draw();
    expect(shoe.needsShuffle).toBe(false);
    shoe.draw();
    expect(shoe.needsShuffle).toBe(true);
    expect(shoe.remaining).toBe(104);
    shoe.shuffle();
    expect(shoe.remaining).toBe(416);
  });

  test('a shuffled shoe still holds every card exactly decks times', () => {
    const shoe = new Shoe(2, 0.75);
    const seen = new Map<string, number>();
    while (shoe.remaining > 0) {
      const card = shoe.draw();
      const key = `${card.rank}${card.suit}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect(seen.size).toBe(52);
    expect([...seen.values()].every((n) => n === 2)).toBe(true);
  });
});

describe('dealer', () => {
  test('soft 17 depends on the rule', () => {
    expect(dealerMustHit(hand('A', '6'), { hitSoft17: true })).toBe(true);
    expect(dealerMustHit(hand('A', '6'), { hitSoft17: false })).toBe(false);
    expect(dealerMustHit(hand('10', '7'), { hitSoft17: true })).toBe(false);
    expect(dealerMustHit(hand('10', '6'), { hitSoft17: false })).toBe(true);
  });

  test('plays out from a draw function', () => {
    const queue = hand('A', '10');
    const out = playDealer(hand('A', '6'), () => queue.shift()!, { hitSoft17: true });
    // A,6 hits (soft 17), draws A: soft 18, stands.
    expect(out.map((x) => x.rank)).toEqual(['A', '6', 'A']);
  });
});

describe('actions', () => {
  test('surrender only on the first two cards, split only on pairs', () => {
    expect(availableActions(hand('10', '6'), DEFAULT_RULES)).toEqual(['hit', 'stand', 'double', 'surrender']);
    expect(availableActions(hand('8', '8'), DEFAULT_RULES)).toContain('split');
    expect(availableActions(hand('10', '3', '3'), DEFAULT_RULES)).toEqual(['hit', 'stand']);
    expect(availableActions(hand('5', '6'), { ...DEFAULT_RULES, surrender: 'none' })).toEqual(['hit', 'stand', 'double']);
  });

  test('double restrictions and split limits', () => {
    const r = { ...DEFAULT_RULES, doubleOn: '10-11' as const };
    expect(availableActions(hand('5', '4'), r)).not.toContain('double');
    expect(availableActions(hand('5', '5'), r)).toContain('double');
    expect(availableActions(hand('5', '6'), { ...DEFAULT_RULES, doubleAfterSplit: false }, { fromSplit: true })).not.toContain('double');
    expect(availableActions(hand('8', '8'), DEFAULT_RULES, { fromSplit: true, hands: 4 })).not.toContain('split');
    expect(availableActions(hand('A', 'A'), DEFAULT_RULES, { fromSplit: true, hands: 2, splitAces: true })).toEqual(['stand']);
    expect(availableActions(hand('A', 'A'), { ...DEFAULT_RULES, resplitAces: true }, { fromSplit: true, hands: 2, splitAces: true })).toEqual(['stand', 'split']);
  });
});

describe('payouts', () => {
  test('blackjack pays 3:2 or 6:5', () => {
    expect(settleHand(hand('A', 'K'), hand('10', '9'), 10, { blackjackPays: 1.5 }).net).toBe(15);
    expect(settleHand(hand('A', 'K'), hand('10', '9'), 10, { blackjackPays: 1.2 }).net).toBe(12);
  });

  test('21 after a split is not a blackjack', () => {
    expect(settleHand(hand('A', 'K'), hand('10', '9'), 10, DEFAULT_RULES, { fromSplit: true }).net).toBe(10);
  });

  test('push, bust, surrender, dealer blackjack', () => {
    expect(settleHand(hand('10', '8'), hand('9', '9'), 10, DEFAULT_RULES).result).toBe('push');
    expect(settleHand(hand('10', '8', '5'), hand('10', '6', '10'), 10, DEFAULT_RULES).net).toBe(-10);
    expect(settleHand(hand('10', '6'), hand('10', '7'), 10, DEFAULT_RULES, { surrendered: true }).net).toBe(-5);
    expect(settleHand(hand('10', '10'), hand('A', 'Q'), 10, DEFAULT_RULES).net).toBe(-10);
    expect(settleHand(hand('A', 'Q'), hand('A', 'K'), 10, DEFAULT_RULES).result).toBe('push');
  });

  test('insurance pays 2:1', () => {
    expect(settleInsurance(5, true)).toBe(10);
    expect(settleInsurance(5, false)).toBe(-5);
  });
});
