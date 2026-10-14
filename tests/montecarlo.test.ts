import { describe, expect, test } from 'vitest';
import {
  type Card, type Pip, type Rank, type Rules, DEFAULT_RULES, classifyPips, evaluateClass, playDealer, settleHand,
} from '../src/engine';

// Independent cross-check of the EV recursion: simulate stand and double with the game engine's own dealer
// play and settlement, from an effectively infinite shoe, and compare with the EV engine at 2000 decks.

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const card = (p: Pip): Card => ({ rank: p === 1 ? 'A' : (String(p) as Rank), suit: 'spades' });
const isDealerBJ = (u: Pip, h: Card) => (u === 1 && (h.rank === '10' || h.rank === 'J' || h.rank === 'Q' || h.rank === 'K')) || (u === 10 && h.rank === 'A');

const N = 400_000;
const TOLERANCE = 0.012; // per unit bet, about 4 standard errors for a doubled bet

describe.each([true, false])('H17 = %s', (hitSoft17) => {
  const rules: Rules = { ...DEFAULT_RULES, decks: 2000 as Rules['decks'], hitSoft17 };
  const cases: [Pip, Pip, Pip][] = [[1, 2, 5], [5, 6, 6], [10, 6, 10], [9, 3, 4], [1, 7, 9]];

  test.each(cases)('%i,%i vs %i: stand and double match simulation', (a, b, u) => {
    const rng = mulberry32(a * 100 + b * 10 + u + (hitSoft17 ? 1000 : 0));
    const draw = (): Card => ({ rank: RANKS[Math.floor(rng() * 13)], suit: 'spades' });
    let stand = 0;
    let dbl = 0;
    let n = 0;
    while (n < N) {
      const hole = draw();
      if (isDealerBJ(u, hole)) continue; // EVs are after the peek
      const dealer = playDealer([card(u), hole], draw, rules);
      const player = [card(a), card(b)];
      stand += settleHand(player, dealer, 1, rules).net;
      dbl += settleHand([...player, draw()], dealer, 2, rules).net;
      n++;
    }
    const e = evaluateClass(classifyPips(a, b), u, rules).options;
    const ev = (x: string) => e.find((o) => o.action === x)!.ev;
    expect(Math.abs(stand / N - ev('stand'))).toBeLessThan(TOLERANCE);
    expect(Math.abs(dbl / N - ev('double'))).toBeLessThan(TOLERANCE);
  });
});
