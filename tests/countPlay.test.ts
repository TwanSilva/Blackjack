import { describe, expect, test } from 'vitest';
import {
  type Action, type Card, type Pip, type Rank, DEFAULT_RULES, DEVIATIONS, bestPlay, explainCountPlay,
  makeCountPlayQuestion, trueCount,
} from '../src/engine';

const R = DEFAULT_RULES; // 8 decks, H17, DAS, late surrender, peek: the rules the indices were simulated for
const c = (rank: Rank): Card => ({ rank, suit: 'spades' });
const hand = (...ranks: Rank[]) => ranks.map(c);
const up = (p: Pip): Card => c(p === 1 ? 'A' : (String(p) as Rank));
const play = (cards: Card[], u: Pip, tc?: number) => bestPlay(cards, up(u), R, tc).best;

function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One hand per row, and the index the oracle must switch at (floor rounding). Stand/hit rows whose two-card
 * hand is surrendered under these rules (16 vs 10, 16 vs 9) use a three-card hand; 16 vs 9 then uses its
 * in-game index, +4.
 */
const CASES: [id: string, cards: Rank[], upcard: Pip, index: number, atOrAbove: Action, below: Action][] = [
  ['16v10', ['10', '4', '2'], 10, 0, 'stand', 'hit'],
  ['15v10', ['10', '3', '2'], 10, 4, 'stand', 'hit'],
  ['TTv5', ['K', 'Q'], 5, 5, 'split', 'stand'],
  ['TTv6', ['10', 'J'], 6, 4, 'split', 'stand'],
  ['10v10', ['6', '4'], 10, 4, 'double', 'hit'],
  ['12v3', ['10', '2'], 3, 1, 'stand', 'hit'],
  ['12v2', ['9', '3'], 2, 3, 'stand', 'hit'],
  ['11vA', ['6', '5'], 1, -1, 'double', 'hit'],
  ['9v2', ['5', '4'], 2, 1, 'double', 'hit'],
  ['10vA', ['7', '3'], 1, 3, 'double', 'hit'],
  ['9v7', ['6', '3'], 7, 4, 'double', 'hit'],
  ['16v9', ['10', '4', '2'], 9, 4, 'stand', 'hit'],
  ['13v2', ['10', '3'], 2, -1, 'stand', 'hit'],
  ['12v4', ['10', '2'], 4, 0, 'stand', 'hit'],
  ['12v5', ['8', '4'], 5, -2, 'stand', 'hit'],
  ['12v6', ['7', '5'], 6, -3, 'stand', 'hit'],
  ['13v3', ['9', '4'], 3, -2, 'stand', 'hit'],
  ['14v10sur', ['9', '5'], 10, 3, 'surrender', 'hit'],
  ['15v10sur', ['9', '6'], 10, 0, 'surrender', 'hit'],
  ['15v9sur', ['10', '5'], 9, 2, 'surrender', 'hit'],
  ['15vAsur', ['8', '7'], 1, -1, 'surrender', 'hit'],
];

describe('the oracle applies every index exactly at its number (H17, floor)', () => {
  test('every playing row of the table has a case', () => {
    expect(CASES.map((x) => x[0]).sort()).toEqual(DEVIATIONS.filter((d) => d.group !== 'insurance').map((d) => d.id).sort());
  });

  test.each(CASES)('%s', (id, ranks, u, index, atOrAbove, below) => {
    const cards = hand(...ranks);
    expect(play(cards, u, index)).toBe(atOrAbove);
    expect(play(cards, u, index + 3)).toBe(atOrAbove);
    expect(play(cards, u, index - 1)).toBe(below);
    expect(play(cards, u, index - 3)).toBe(below);
    const a = bestPlay(cards, up(u), R, index);
    expect(a.count!.applied.map((x) => x.row.id), id).toContain(id);
    expect(a.count!.warning).toBeNull();
    // Basic strategy sits on the count-neutral side of the switch. An index of 0 can go either way: a
    // displayed 0 covers real counts from 0 up to 1, so 16 vs 10 stands at 0 although basic strategy hits.
    const basic = bestPlay(cards, up(u), R).best;
    if (index > 0) expect(basic).toBe(below);
    else if (index < 0) expect(basic).toBe(atOrAbove);
    else expect([atOrAbove, below]).toContain(basic);
  });
});

describe('how the rows combine', () => {
  test('surrender is decided first: 15 vs 10 surrenders at 0 and up, even where the stand index (+4) is passed', () => {
    const h = hand('9', '6');
    expect(play(h, 10, -1)).toBe('hit');
    expect(play(h, 10, 0)).toBe('surrender');
    expect(play(h, 10, 6)).toBe('surrender');
  });

  test('two-card 16 vs 10 and 16 vs 9 are surrendered at every count (basic strategy, no Fab 4 row)', () => {
    for (const tc of [-6, -1, 0, 3, 8]) {
      expect(play(hand('10', '6'), 10, tc)).toBe('surrender');
      expect(play(hand('9', '7'), 9, tc)).toBe('surrender');
    }
  });

  test('without surrender in the rules, the stand/hit row decides two-card hands too', () => {
    // These rules no longer match the simulated table, so the row is not applied: basic strategy plus a warning.
    const noSur = { ...R, surrender: 'none' as const };
    const a = bestPlay(hand('10', '6'), up(10), noSur, 3);
    expect(a.best).toBe('hit');
    expect(a.count!.warning).toMatch(/table rules are different/);
  });

  test('a row whose play is not allowed is skipped: 10 vs 10 with three cards cannot double', () => {
    expect(play(hand('4', '3', '3'), 10, 6)).toBe('hit');
    expect(bestPlay(hand('4', '3', '3'), up(10), R, 6).count!.applied).toHaveLength(0);
  });

  test('a hand no row covers keeps basic strategy at any count', () => {
    for (const tc of [-5, 0, 5]) {
      const a = bestPlay(hand('10', '7'), up(7), R, tc);
      expect(a.best).toBe('stand');
      expect(a.count).toEqual({ best: 'stand', applied: [], warning: null });
    }
  });

  test('without a count nothing changes: best is basic strategy and there is no count decision', () => {
    const a = bestPlay(hand('10', '2'), up(3), R);
    expect(a.best).toBe(a.basicBest);
    expect(a.count).toBeNull();
  });

  test('a mismatched rounding or rule set keeps basic strategy and says why', () => {
    const r1 = bestPlay(hand('10', '2'), up(3), R, { value: 5, rounding: 'nearest' });
    expect(r1.best).toBe('hit');
    expect(r1.count!.warning).toMatch(/set to nearest/);
    const r2 = bestPlay(hand('10', '2'), up(3), { ...R, hitSoft17: false }, 5);
    expect(r2.best).toBe('hit');
    expect(r2.count!.warning).toMatch(/table rules are different/);
  });
});

describe('play-the-count questions', () => {
  test('the answer is the oracle at that count, and the count flips it within a step of the index', () => {
    const rng = seeded(7);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const q = makeCountPlayQuestion(R, 'floor', 'shown', rng);
      seen.add(q.row.id);
      expect(Math.abs(q.trueCount - q.row.index)).toBeLessThanOrEqual(3);
      if (q.row.group === 'insurance') {
        expect(q.answer).toBe(q.trueCount >= 3 ? 'insurance' : 'no-insurance');
        continue;
      }
      expect(q.answer).toBe(bestPlay(q.player, q.upcard, R, q.trueCount).best);
      const used = q.advice!.count!.applied.find((a) => a.row.id === q.row.id)!;
      expect(bestPlay(q.player, q.upcard, R, used.index).best).not.toBe(bestPlay(q.player, q.upcard, R, used.index - 1).best);
      expect(explainCountPlay(q)).toContain('True count');
    }
    expect(seen.size).toBe(DEVIATIONS.length); // every row comes up
  });

  test('hidden mode gives a running count and decks left that floor to the question true count', () => {
    const rng = seeded(11);
    for (let i = 0; i < 200; i++) {
      const q = makeCountPlayQuestion(R, 'floor', 'hidden', rng);
      expect(q.running).toBeDefined();
      expect(q.decksLeft! % 0.5).toBe(0);
      expect(trueCount(q.running!, q.decksLeft!, 'floor')).toBe(q.trueCount);
      expect(explainCountPlay(q)).toMatch(/÷ .* decks? =/);
    }
  });

  test('a question names the rule that applied and what basic strategy would do', () => {
    const rng = seeded(3);
    let q = makeCountPlayQuestion(R, 'floor', 'shown', rng);
    while (q.row.id !== '16v10') q = makeCountPlayQuestion(R, 'floor', 'shown', rng);
    const text = explainCountPlay(q);
    expect(text).toContain('Hard 16 vs 10: stand at 0 or higher, hit below.');
    expect(text).toMatch(/basic strategy would|same as basic strategy/);
  });
});
