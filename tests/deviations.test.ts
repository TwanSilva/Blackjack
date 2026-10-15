import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  type Card, DEFAULT_RULES, DEVIATIONS, INSURANCE_DEVIATION, INSURANCE_INDEX, MEMORY_HILO_SOURCE, SIM_H17_SOURCE,
  bestPlay, buildChart, describeDeviation, deviationMismatch, indexMismatch, roundingMismatch, rulesMismatch, sourceStatus,
  strategyKey,
} from '../src/engine';

const c = (rank: Card['rank']): Card => ({ rank, suit: 'clubs' });
const ace = c('A');

interface SimSummary {
  rules: typeof DEFAULT_RULES;
  rounding: string;
  shoes: number;
  rows: { id: string; index: number; confidence: 'clear' | 'close'; inGame: { index: number } }[];
}
const sim = JSON.parse(readFileSync('docs/sim-indices-h17.json', 'utf8')) as SimSummary;

/** The earlier table, typed from memory: kept as a reference column, never applied. */
const MEMORY: Record<string, number> = {
  insurance: 3, '16v10': 0, '15v10': 4, TTv5: 5, TTv6: 4, '10v10': 4, '12v3': 2, '12v2': 3, '11vA': 1, '9v2': 1,
  '10vA': 4, '9v7': 3, '16v9': 5, '13v2': -1, '12v4': 0, '12v5': -2, '12v6': -1, '13v3': -2, '14v10sur': 3,
  '15v10sur': 0, '15v9sur': 2, '15vAsur': 1,
};

describe('deviation index table', () => {
  test('has the insurance row, the Illustrious 18 and the Fab 4', () => {
    expect(DEVIATIONS.filter((d) => d.group === 'insurance')).toHaveLength(1);
    // The Illustrious 18 includes insurance, so 17 play rows plus the insurance row.
    expect(DEVIATIONS.filter((d) => d.group === 'illustrious18')).toHaveLength(17);
    expect(DEVIATIONS.filter((d) => d.group === 'fab4')).toHaveLength(4);
    expect(new Set(DEVIATIONS.map((d) => d.id)).size).toBe(DEVIATIONS.length);
  });

  test('every index matches the 20-million-shoe simulation for H17, floor', () => {
    expect(sim.shoes).toBeGreaterThanOrEqual(20_000_000);
    expect(sim.rounding).toBe('floor');
    expect(strategyKey(sim.rules)).toBe(strategyKey(DEFAULT_RULES));
    for (const d of DEVIATIONS) {
      const s = sim.rows.find((r) => r.id === d.id)!;
      expect(d.index, d.id).toBe(s.index);
      expect(d.confidence, d.id).toBe(s.confidence);
      if (s.inGame.index !== s.index) expect(d.inGameIndex, d.id).toBe(s.inGame.index);
      else expect(d.inGameIndex, d.id).toBeUndefined();
    }
  });

  test('every index is tagged with the simulation as its source: rules, rounding, verified', () => {
    for (const d of DEVIATIONS) {
      expect(d.source, d.id).toBe(SIM_H17_SOURCE);
    }
    expect(SIM_H17_SOURCE).toMatchObject({ verified: true, verification: 'simulation', rounding: 'floor', roundingVerified: true });
    expect(strategyKey(SIM_H17_SOURCE.rules!)).toBe(strategyKey(DEFAULT_RULES));
    expect(SIM_H17_SOURCE.provenance).toMatch(/20,000,160 shuffled shoes/);
    expect(SIM_H17_SOURCE.game).toMatch(/^H17 · 8 decks/);
    expect(sourceStatus(SIM_H17_SOURCE)).toMatch(/^Verified by simulation for H17 · 8 decks/);
  });

  test('the memory values are kept as a reference column, and the memory source stays unverified', () => {
    for (const d of DEVIATIONS) expect(d.memoryIndex, d.id).toBe(MEMORY[d.id]);
    expect(MEMORY_HILO_SOURCE).toMatchObject({ verified: false, verification: 'none', roundingVerified: false });
    expect(sourceStatus(MEMORY_HILO_SOURCE)).toMatch(/^Unverified/);
    // The six rows where H17 changed the answer, from the comparison in docs/index-comparison.md.
    const changed = DEVIATIONS.filter((d) => d.index !== d.memoryIndex).map((d) => d.id).sort();
    expect(changed).toEqual(['10vA', '11vA', '12v3', '12v6', '15vAsur', '9v7']);
  });

  test('descriptions read plainly', () => {
    expect(describeDeviation(DEVIATIONS.find((d) => d.id === '16v10')!)).toBe('Hard 16 vs 10: stand at 0 or higher, hit below.');
    expect(describeDeviation(DEVIATIONS.find((d) => d.id === '11vA')!)).toBe('Hard 11 vs Ace: double at −1 or higher, hit below.');
    expect(describeDeviation(INSURANCE_DEVIATION)).toBe('Insurance vs Ace: take insurance at +3 or higher, decline insurance below.');
  });

  test('the insurance index the oracle uses comes from the table', () => {
    expect(INSURANCE_INDEX).toBe(INSURANCE_DEVIATION.index);
    expect(bestPlay([c('10'), c('7')], ace, DEFAULT_RULES, 3).insurance!.source).toBe(SIM_H17_SOURCE);
  });
});

describe('rounding and rules mismatch', () => {
  test('no warning for the default rules with floor rounding', () => {
    expect(indexMismatch(SIM_H17_SOURCE, 'floor', DEFAULT_RULES)).toBeNull();
    // Penetration doesn't change strategy, so it doesn't count as a different rule set.
    expect(rulesMismatch(SIM_H17_SOURCE, { ...DEFAULT_RULES, penetration: 0.6 })).toBeNull();
  });

  test('a different rounding gives a warning', () => {
    expect(roundingMismatch(SIM_H17_SOURCE, 'nearest')).toMatch(/assume round down.*set to nearest/);
    expect(roundingMismatch(SIM_H17_SOURCE, 'truncate')).toMatch(/toward zero/);
  });

  test('different table rules give a warning', () => {
    expect(rulesMismatch(SIM_H17_SOURCE, { ...DEFAULT_RULES, hitSoft17: false })).toMatch(/simulated for H17 · 8 decks/);
    expect(rulesMismatch(SIM_H17_SOURCE, { ...DEFAULT_RULES, decks: 6 })).not.toBeNull();
    expect(rulesMismatch(SIM_H17_SOURCE, { ...DEFAULT_RULES, surrender: 'none' })).not.toBeNull();
    expect(indexMismatch(SIM_H17_SOURCE, 'nearest', { ...DEFAULT_RULES, decks: 6 })).toMatch(/table rules are different.*set to nearest/);
  });

  test('insurance ignores the playing rules; every playing deviation depends on them', () => {
    const s17 = { ...DEFAULT_RULES, hitSoft17: false };
    for (const d of DEVIATIONS) {
      expect(d.rulesDependent, d.id).toBe(d.group !== 'insurance');
      if (d.group === 'insurance') expect(deviationMismatch(d, 'floor', s17), d.id).toBeNull();
      else expect(deviationMismatch(d, 'floor', s17), d.id).toMatch(/table rules are different/);
      expect(deviationMismatch(d, 'floor', DEFAULT_RULES), d.id).toBeNull();
      expect(deviationMismatch(d, 'nearest', DEFAULT_RULES), d.id).toMatch(/set to nearest/);
    }
  });

  test('the oracle does not apply the insurance index when the rounding differs', () => {
    const hand = [c('10'), c('7')];
    expect(bestPlay(hand, ace, DEFAULT_RULES, { value: 4, rounding: 'floor' }).insurance).toMatchObject({ take: true, warning: null });
    expect(bestPlay(hand, ace, DEFAULT_RULES, 2).insurance).toMatchObject({ take: false, warning: null });
    const offRounding = bestPlay(hand, ace, DEFAULT_RULES, { value: 4, rounding: 'nearest' }).insurance!;
    expect(offRounding.take).toBeNull();
    expect(offRounding.warning).toMatch(/not applied/);
    // Other playing rules don't change insurance.
    expect(bestPlay(hand, ace, { ...DEFAULT_RULES, hitSoft17: false, decks: 4 }, 4).insurance).toMatchObject({ take: true, warning: null });
    // Without a count it is basic strategy, which uses no index: never insure, no warning.
    expect(bestPlay(hand, ace, { ...DEFAULT_RULES, hitSoft17: false }).insurance).toMatchObject({ take: false, warning: null });
  });

  test('the chart states where the insurance index came from', () => {
    expect(buildChart(DEFAULT_RULES).insuranceStatus).toMatch(/^Index \+3: Verified by simulation for H17 · 8 decks/);
  });
});
