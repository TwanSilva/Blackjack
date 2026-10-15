import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RULES, DEVIATIONS, type DeviationIndex, type IndexPlay, adviseClass, computeIndex, deviationGain, trueCount,
} from '../src/engine';

/**
 * Every index switches exactly at its number, with floor rounding, for the default table
 * (8 decks, H17, double after split, late surrender, dealer peeks).
 *
 * The expected numbers are the engine's computed indices (see docs/index-comparison.md), not a published list.
 * With 4 decks left and whole running counts, a floor true count of n covers real counts n, n+0.25, n+0.5 and
 * n+0.75. At the index the deviation must win on average over those; one below it the other play must win.
 */

const RULES = DEFAULT_RULES;
const DECKS_LEFT = 4;

const EXPECTED_H17_FLOOR: Record<string, number> = {
  insurance: 3,
  '16v10': 1,
  '15v10': 4,
  TTv5: 5,
  TTv6: 4,
  '10v10': 4,
  '12v3': 1,
  '12v2': 3,
  '11vA': -1,
  '9v2': 0,
  '10vA': 3,
  '9v7': 3,
  '16v9': 5,
  '13v2': -1,
  '12v4': -1,
  '12v5': -2,
  '12v6': -4,
  '13v3': -3,
  '14v10sur': 3,
  '15v10sur': 0,
  '15v9sur': 2,
  '15vAsur': -1,
};

/** Average EV gain of the deviation over the real counts that floor to `shown`, from whole running counts. */
function gainAtShownCount(d: DeviationIndex, shown: number): number {
  let sum = 0;
  let n = 0;
  for (let rc = shown * DECKS_LEFT; rc < (shown + 1) * DECKS_LEFT; rc++) {
    expect(trueCount(rc, DECKS_LEFT, 'floor')).toBe(shown); // floor rounding, as the player would see it
    sum += deviationGain(d, RULES, rc / DECKS_LEFT, DECKS_LEFT)!;
    n++;
  }
  return sum / n;
}

/** Which of the row's two plays basic strategy picks (a fresh shoe, no count). */
function basicPlay(d: DeviationIndex): IndexPlay {
  if (!d.hand) return 'no-insurance';
  const opts = adviseClass(d.hand, d.upcard, RULES).options;
  const ev = (a: IndexPlay) => opts.find((o) => o.action === a)!.ev;
  return ev(d.atOrAbove) > ev(d.below) ? d.atOrAbove : d.below;
}

describe('index switches exactly at the index (H17, 8 decks, floor)', () => {
  test('every row of the table has an expected index', () => {
    expect(Object.keys(EXPECTED_H17_FLOOR).sort()).toEqual(DEVIATIONS.map((d) => d.id).sort());
  });

  test.each(DEVIATIONS.map((d) => [d.id, d] as const))('%s', (_id, d) => {
    const index = EXPECTED_H17_FLOOR[d.id];
    // 1. The engine's own index finder agrees.
    expect(computeIndex(d, RULES).index.floor).toBe(index);
    // 2. At the index the deviation's play is the better one.
    expect(gainAtShownCount(d, index)).toBeGreaterThanOrEqual(0);
    // 3. One below the index the other play is the better one.
    expect(gainAtShownCount(d, index - 1)).toBeLessThan(0);
    // 4. Basic strategy sits on the right side of the switch.
    //    Most rows deviate at high counts: basic is the "below" play, and one below the index gives it (check 3).
    //    Rows like 12 vs 4 deviate at low counts (hit below): basic is the "at or above" play, so the index can't
    //    be above 0, and at the index and above you get basic (check 2).
    const basic = basicPlay(d);
    if (basic === d.atOrAbove) expect(index).toBeLessThanOrEqual(0);
    else expect(index).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
