import { describe, expect, test } from 'vitest';
import {
  type Card, DEFAULT_RULES, DEVIATIONS, INSURANCE_DEVIATION, INSURANCE_INDEX, MEMORY_HILO_SOURCE, bestPlay,
  buildChart, describeDeviation, roundingMismatch, sourceStatus,
} from '../src/engine';

const c = (rank: Card['rank']): Card => ({ rank, suit: 'clubs' });
const ace = c('A');

describe('deviation index table', () => {
  test('has the insurance row, the Illustrious 18 and the Fab 4', () => {
    expect(DEVIATIONS.filter((d) => d.group === 'insurance')).toHaveLength(1);
    // The Illustrious 18 includes insurance, so 17 play rows plus the insurance row.
    expect(DEVIATIONS.filter((d) => d.group === 'illustrious18')).toHaveLength(17);
    expect(DEVIATIONS.filter((d) => d.group === 'fab4')).toHaveLength(4);
    expect(new Set(DEVIATIONS.map((d) => d.id)).size).toBe(DEVIATIONS.length);
  });

  test('every index is tagged with its source and the rounding it assumes', () => {
    for (const d of DEVIATIONS) {
      expect(d.source.provenance.length, d.id).toBeGreaterThan(20);
      expect(['floor', 'nearest', 'truncate']).toContain(d.source.rounding);
      expect(typeof d.source.roundingVerified).toBe('boolean');
    }
  });

  test('the table is marked unverified: it was written from memory', () => {
    for (const d of DEVIATIONS) {
      expect(d.source.verified, d.id).toBe(false);
      expect(d.source.roundingVerified, d.id).toBe(false);
    }
    expect(MEMORY_HILO_SOURCE.provenance).toMatch(/from memory/);
    expect(sourceStatus(MEMORY_HILO_SOURCE)).toMatch(/^Unverified/);
  });

  test('descriptions read plainly', () => {
    expect(describeDeviation(DEVIATIONS.find((d) => d.id === '16v10')!)).toBe('Hard 16 vs 10: stand at 0 or higher, hit below.');
    expect(describeDeviation(INSURANCE_DEVIATION)).toBe('Insurance vs Ace: take insurance at +3 or higher, decline insurance below.');
  });

  test('the insurance index the oracle uses comes from the table', () => {
    expect(INSURANCE_INDEX).toBe(INSURANCE_DEVIATION.index);
    expect(bestPlay([c('10'), c('7')], ace, DEFAULT_RULES, 3).insurance!.source).toBe(MEMORY_HILO_SOURCE);
  });
});

describe('rounding mismatch', () => {
  test('no warning when the rounding matches the table', () => {
    expect(roundingMismatch(MEMORY_HILO_SOURCE, 'floor')).toBeNull();
  });

  test('a warning when it does not', () => {
    expect(roundingMismatch(MEMORY_HILO_SOURCE, 'nearest')).toMatch(/assume round down.*set to nearest/);
    expect(roundingMismatch(MEMORY_HILO_SOURCE, 'truncate')).toMatch(/toward zero/);
  });

  test('the oracle does not apply the insurance index with a mismatched rounding', () => {
    const hand = [c('10'), c('7')];
    const ok = bestPlay(hand, ace, DEFAULT_RULES, { value: 4, rounding: 'floor' }).insurance!;
    expect(ok).toMatchObject({ take: true, warning: null });
    const off = bestPlay(hand, ace, DEFAULT_RULES, { value: 4, rounding: 'nearest' }).insurance!;
    expect(off.take).toBeNull();
    expect(off.warning).toMatch(/not applied/);
    // Without a count it is basic strategy, which uses no index: never insure, no warning.
    expect(bestPlay(hand, ace, DEFAULT_RULES).insurance).toMatchObject({ take: false, warning: null });
  });

  test('the chart states where the insurance index came from', () => {
    expect(buildChart(DEFAULT_RULES).insuranceStatus).toMatch(/^Index \+3: Unverified/);
  });
});
