import { describe, expect, test } from 'vitest';
import {
  type Card, type Rank, type Rules, type ShoeLike, DEFAULT_RULES, DEFAULT_SPREAD, TableGame, bestPlay, countValue,
} from '../src/engine';

/** A shoe with a fixed card order, for exact scenarios. */
class StackedShoe implements ShoeLike {
  private i = 0;
  constructor(private readonly cards: Card[]) {}
  draw(): Card {
    if (this.i >= this.cards.length) throw new Error('Stacked shoe ran out');
    return this.cards[this.i++];
  }
  shuffle(): void { this.i = 0; }
  get needsShuffle(): boolean { return false; }
  get remaining(): number { return this.cards.length - this.i; }
}

const c = (rank: Rank): Card => ({ rank, suit: 'hearts' });
const stack = (...ranks: Rank[]) => new StackedShoe(ranks.map(c));

function game(shoe: ShoeLike, rules: Rules = DEFAULT_RULES, others = 0) {
  return new TableGame({ rules, spread: DEFAULT_SPREAD, unitPotatoes: 10, bankroll: 1000, others, rounding: 'floor', shoe });
}

// With no other players the deal is: your card, dealer up, your card, dealer hole, then draws.

describe('table rounds', () => {
  test('blackjack pays 3:2', () => {
    const g = game(stack('A', '9', 'K', '7'));
    g.placeBet(1);
    expect(g.phase).toBe('roundOver');
    expect(g.bankroll).toBe(1015);
    expect(g.hero.hands[0].settlement!.result).toBe('blackjack');
  });

  test('dealer blackjack with a peek: lose only the bet, insurance pays 2:1', () => {
    const g = game(stack('10', 'A', 'Q', 'K'));
    g.placeBet(2);
    expect(g.phase).toBe('insurance');
    g.insurance(true);
    expect(g.phase).toBe('roundOver');
    expect(g.bankroll).toBe(1000); // −20 on the hand, +20 on 10 of insurance
    const ins = g.decisions.find((d) => d.kind === 'insurance')!;
    expect(ins.best).toBe('decline'); // count near 0: basic strategy declines
    expect(ins.correct).toBe(false);
  });

  test('split aces get one card each, and 21 after a split pays 1:1', () => {
    const g = game(stack('A', '6', 'A', '10', 'K', '8', '10'));
    g.placeBet(1);
    g.decide('split');
    expect(g.hero.hands.map((h) => h.cards.map((x) => x.rank))).toEqual([['A', 'K'], ['A', '8']]);
    expect(g.phase).toBe('roundOver'); // no decisions on split aces; dealer 16 drew 10 and busted
    expect(g.hero.hands.map((h) => h.settlement!.net)).toEqual([10, 10]);
  });

  test('double: one card, twice the bet', () => {
    const g = game(stack('6', '6', '5', '10', '10', '9'));
    g.placeBet(1);
    expect(g.allowedActions()).toContain('double');
    g.decide('double');
    expect(g.hero.hands[0].cards).toHaveLength(3);
    expect(g.bankroll).toBe(1020); // 21 against a dealer bust
  });

  test('surrender loses half the bet', () => {
    const g = game(stack('10', '10', '6', '7'));
    g.placeBet(2);
    g.decide('surrender');
    expect(g.bankroll).toBe(990);
  });

  test('no hole card: a dealer blackjack takes the doubled bet in full', () => {
    const enhc: Rules = { ...DEFAULT_RULES, dealerPeeks: false, surrender: 'none', hitSoft17: false };
    const g = game(stack('6', '10', '5', 'A', '2'), enhc);
    g.placeBet(1);
    expect(g.phase).toBe('playing'); // nobody peeks
    g.decide('double');
    expect(g.bankroll).toBe(980);
  });

  test('the running count covers every card seen, the hole card once it is turned over', () => {
    const ranks: Rank[] = ['10', '6', '2', '10', '5', '9'];
    const g = game(stack(...ranks));
    g.placeBet(1);
    // You: 10, 2 (12) vs 6. Before the reveal the hole card (10) is not counted.
    expect(g.runningCount).toBe(countValue(c('10')) + countValue(c('6')) + countValue(c('2')));
    g.decide('stand');
    expect(g.runningCount).toBe(ranks.reduce((s, r) => s + countValue(c(r)), 0));
  });

  test('other players play basic strategy before you', () => {
    // Others: Ana gets 10, 6 vs dealer 10 and surrenders (basic strategy with late surrender).
    const g = game(stack('10', '9', '10', '6', '10', '7', '5'), DEFAULT_RULES, 1);
    g.placeBet(1);
    const ana = g.seats[0].hands[0];
    expect(ana.cards.map((x) => x.rank)).toEqual(['10', '6']);
    expect(ana.surrendered).toBe(bestPlay(ana.cards, c('10'), DEFAULT_RULES).best === 'surrender');
    expect(g.phase).toBe('playing');
  });

  test('bets are graded against the spread at the true count before the deal', () => {
    const g = game(stack('10', '9', '8', '7'));
    g.placeBet(3);
    const bet = g.decisions.find((d) => d.kind === 'bet')!;
    expect(bet).toMatchObject({ correct: false, chosen: '3', best: '1' });
    expect(bet.note).toMatch(/over-betting/);
  });

  test('your decisions are graded against the engine at the current true count', () => {
    const g = game(stack('10', '10', '6', '7', '9'));
    g.placeBet(1);
    const expected = g.advice().best;
    g.decide('hit');
    const d = g.decisions.find((x) => x.kind === 'play')!;
    expect(d.best).toBe(expected);
    expect(d.correct).toBe(expected === 'hit');
  });

  test('the tilt guard speaks once, after a losing streak and quick wrong decisions', () => {
    // Every round: you 10, 7 vs dealer 10 up with a 10 in the hole (20). Standing is right and loses.
    const round: Rank[] = ['10', '10', '7', '10'];
    const g = game(new StackedShoe(Array.from({ length: 12 }, () => round).flat().map(c)));
    for (let i = 0; i < 3; i++) {
      g.placeBet(1);
      g.decide('stand', 3000);
      g.nextRound();
    }
    expect(g.losingRounds).toBe(3);
    expect(g.tiltWarning()).toBeNull(); // no quick mistakes yet
    for (let i = 0; i < 2; i++) {
      g.placeBet(1);
      g.decide('hit', 500); // wrong (17 vs 10 stands) and quick
      if (g.phase === 'playing') g.decide('stand', 500);
      g.nextRound();
    }
    expect(g.tiltWarning()).toMatch(/short break/);
    expect(g.tiltWarning()).toBeNull(); // only once per streak
  });
});

describe('long run with a perfect player', () => {
  test('bankroll accounting, phases and grading stay consistent over thousands of rounds', () => {
    let seed = 99;
    const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const g = new TableGame({ rules: DEFAULT_RULES, spread: DEFAULT_SPREAD, unitPotatoes: 10, bankroll: 100000, others: 2, rounding: 'floor', rng });
    let shuffles = 0;
    for (let r = 0; r < 3000; r++) {
      const units = Math.min(g.betOptions().at(-1)!, [1, 1, 1, 2, 4, 6, 8][Math.max(0, Math.min(6, g.trueCount + 1))]);
      g.placeBet(units);
      if (g.phase === 'insurance') g.insurance(g.insuranceAnswer().best);
      while (g.phase === 'playing') g.decide(g.advice().best);
      expect(['roundOver', 'broke']).toContain(g.phase);
      if (g.phase === 'broke') break;
      if (g.nextRound()) shuffles++;
    }
    const s = g.summary();
    expect(g.bankroll - g.startingBankroll).toBeCloseTo(g.results.reduce((a, r) => a + r.net, 0), 6);
    expect(s.plays.correct).toBe(s.plays.total);
    expect(s.insurance.correct).toBe(s.insurance.total);
    expect(shuffles).toBeGreaterThan(10);
  }, 120_000);
});
