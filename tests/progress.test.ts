import { describe, expect, test } from 'vitest';
import {
  type Action, type Card, type Pip, type Progress, DEFAULT_RULES, DrillScheduler, RETRY_AFTER, SR_INTERVALS_MS,
  adviseClass, cellBand, cellKey, cellWeight, emptyProgress, hardClass, isWeak, mistakesToReplay, parseCellKey, parseProgress,
  recordCountRun, recordDecision, softClass, strategyTotals, todaysPractice, weakCells,
} from '../src/engine';

const c = (rank: Card['rank']): Card => ({ rank, suit: 'spades' });
const T0 = 1_800_000_000_000;

function decide(p: Progress, total: number, up: Pip, chosen: Action | 'best', now = T0, soft = false) {
  const cls = soft ? softClass(total) : hardClass(total);
  const advice = adviseClass(cls, up, DEFAULT_RULES);
  const action = chosen === 'best' ? advice.best : chosen;
  recordDecision(p, { advice, chosen: action, player: [c('10'), c('3')], upcard: c('5'), ms: 4000, now });
  return advice;
}

function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('cell keys', () => {
  test('round-trip', () => {
    for (const key of ['hard-13|5', 'soft-18|1', 'pair-8|10', 'pair-1|2']) {
      expect(cellKey(parseCellKey(key)!)).toBe(key);
    }
    expect(parseCellKey('nonsense')).toBeNull();
  });
});

describe('recording decisions', () => {
  test('a wrong answer logs the mistake, resets the streak, and makes the cell due now', () => {
    const p = emptyProgress();
    decide(p, 13, 5, 'best');
    decide(p, 13, 5, 'best');
    expect(p.streak).toEqual({ current: 2, best: 2 });
    decide(p, 16, 10, 'stand');
    const rec = p.cells['hard-16|10'];
    expect(rec.box).toBe(0);
    expect(rec.due).toBe(T0);
    expect(rec.lost).toBeGreaterThan(0);
    expect(p.streak).toEqual({ current: 0, best: 2 });
    expect(p.mistakes).toHaveLength(1);
    expect(p.mistakes[0]).toMatchObject({ cell: 'hard-16|10', chosen: 'stand' });
    expect(strategyTotals(p)).toMatchObject({ attempts: 3, correct: 2 });
    expect(p.decisionTime).toEqual({ totalMs: 12000, n: 3 });
  });

  test('right answers move a cell up the boxes and push its due date out', () => {
    const p = emptyProgress();
    for (let i = 1; i <= 4; i++) decide(p, 12, 4, 'best');
    const rec = p.cells['hard-12|4'];
    expect(rec.box).toBe(4);
    expect(rec.due).toBe(T0 + SR_INTERVALS_MS[4]);
    expect(isWeak(rec)).toBe(false);
    // Right once and never missed: not a weak spot.
    decide(p, 13, 2, 'best');
    expect(isWeak(p.cells['hard-13|2'])).toBe(false);
  });

  test('a cell stays weak until it is right several times in a row', () => {
    const p = emptyProgress();
    decide(p, 16, 10, 'stand');
    decide(p, 16, 10, 'best');
    decide(p, 16, 10, 'best');
    expect(isWeak(p.cells['hard-16|10'])).toBe(true);
    decide(p, 16, 10, 'best');
    // 3 of 4 right is under 80%, so it is still weak even in box 3.
    expect(isWeak(p.cells['hard-16|10'])).toBe(true);
    decide(p, 16, 10, 'best');
    expect(isWeak(p.cells['hard-16|10'])).toBe(false);
  });
});

describe('heat map bands', () => {
  test('unseen, weak after a miss, solid once reliably right', () => {
    const p = emptyProgress();
    expect(cellBand(p.cells['hard-16|10'])).toBe('unseen');
    decide(p, 16, 10, 'stand');
    expect(cellBand(p.cells['hard-16|10'])).toBe('weak');
    decide(p, 16, 10, 'best');
    expect(cellBand(p.cells['hard-16|10'])).toBe('weak'); // 1 of 2 is under 60%
    for (let i = 0; i < 8; i++) decide(p, 16, 10, 'best');
    expect(cellBand(p.cells['hard-16|10'])).toBe('solid'); // 9 of 10, box 5
    for (let i = 0; i < 3; i++) decide(p, 12, 4, 'best');
    expect(cellBand(p.cells['hard-12|4'])).toBe('solid');
    decide(p, 12, 3, 'best');
    expect(cellBand(p.cells['hard-12|3'])).toBe('learning'); // right once: not proven yet
  });
});

describe('spaced repetition', () => {
  test('missed cells weigh most, learned cells fade until due', () => {
    const p = emptyProgress();
    decide(p, 16, 10, 'stand');
    for (let i = 0; i < 5; i++) decide(p, 12, 4, 'best');
    const missed = cellWeight(p.cells['hard-16|10'], T0);
    const unseen = cellWeight(undefined, T0);
    const learned = cellWeight(p.cells['hard-12|4'], T0);
    expect(missed).toBeGreaterThan(unseen);
    expect(learned).toBeLessThan(unseen);
    // Once its interval passes it comes back.
    expect(cellWeight(p.cells['hard-12|4'], T0 + SR_INTERVALS_MS[5] + 1)).toBeGreaterThan(learned);
  });

  test('a missed cell comes back a few hands later in the same session', () => {
    const p = emptyProgress();
    const s = new DrillScheduler('hard', p, seeded(1));
    const cell = { cls: hardClass(16), upcard: 10 as Pip };
    s.missed(cell, 4);
    expect(cellKey(s.next(4 + RETRY_AFTER, T0))).toBe('hard-16|10');
  });

  test('a cell missed again is not retried a second time in the same session', () => {
    const p = emptyProgress();
    const s = new DrillScheduler('all', p, seeded(9));
    const cell = { cls: hardClass(16), upcard: 10 as Pip };
    s.missed(cell, 0);
    expect(cellKey(s.next(RETRY_AFTER, T0))).toBe('hard-16|10');
    s.missed(cell, RETRY_AFTER);
    let again = 0;
    for (let i = RETRY_AFTER + 1; i < RETRY_AFTER + 10; i++) if (cellKey(s.next(i, T0)) === 'hard-16|10') again++;
    expect(again).toBeLessThan(3); // only the ordinary weighted chance, no forced retry
  });

  test('weak spots draws only weak cells, and falls back to all hands when there are none', () => {
    const p = emptyProgress();
    const empty = new DrillScheduler('weak', p, seeded(2));
    expect(empty.fellBack).toBe(true);
    decide(p, 16, 10, 'stand');
    decide(p, 18, 9, 'stand', T0, true); // soft 18 vs 9 is a hit, so standing is a mistake
    const s = new DrillScheduler('weak', p, seeded(3));
    expect(s.fellBack).toBe(false);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(cellKey(s.next(i, T0)));
    expect([...seen].sort()).toEqual(['hard-16|10', 'soft-18|9']);
  });

  test('the hard filter never deals a soft hand or a pair', () => {
    const s = new DrillScheduler('hard', emptyProgress(), seeded(4));
    for (let i = 0; i < 100; i++) expect(s.next(i, T0).cls.kind).toBe('hard');
  });
});

describe("today's practice", () => {
  test('new player: start with basic strategy', () => {
    expect(todaysPractice(emptyProgress())).toMatchObject({ kind: 'strategy', filter: 'all' });
  });

  test('names the kind of hand that costs the most', () => {
    const p = emptyProgress();
    decide(p, 18, 9, 'stand', T0, true);
    decide(p, 18, 10, 'stand', T0, true);
    decide(p, 12, 3, 'stand');
    const practice = todaysPractice(p);
    expect(practice).toMatchObject({ kind: 'strategy', filter: 'weak' });
    expect(practice.title).toContain('soft totals');
    expect(weakCells(p)).toHaveLength(3);
  });

  test('strategy solid, no counting yet: suggests the count drill', () => {
    const p = emptyProgress();
    for (let i = 0; i < 5; i++) decide(p, 13, 5, 'best');
    expect(todaysPractice(p)).toMatchObject({ kind: 'count', countVariant: 'single' });
    recordCountRun(p, { at: T0, variant: 'deck', mode: 'test', cards: 52, secondsPerCard: 1, correct: true, accuracy: 1, timeMs: 60000 });
    expect(todaysPractice(p).kind).toBe('true');
  });
});

describe('mistake log and import', () => {
  test('replay list is newest first with one entry per cell', () => {
    const p = emptyProgress();
    decide(p, 16, 10, 'stand', T0);
    decide(p, 13, 5, 'hit', T0 + 1);
    decide(p, 16, 10, 'stand', T0 + 2);
    expect(mistakesToReplay(p).map((m) => m.cell)).toEqual(['hard-16|10', 'hard-13|5']);
  });

  test('export and import round-trip, bad files are refused', () => {
    const p = emptyProgress();
    decide(p, 16, 10, 'stand');
    const back = parseProgress(JSON.parse(JSON.stringify(p)));
    expect(back).toEqual(p);
    expect(() => parseProgress({ hello: 1 })).toThrow(/not a trainer progress export/);
    expect(() => parseProgress({ ...p, cells: { 'bad-key': { attempts: 1, correct: 1 } } })).toThrow(/bad entry/);
  });
});
