import {
  type CountMode, type CountVariant, type DrillFilter, type Rules, type TrueCountRounding, type TrueCountSource,
  DEFAULT_RULES, DEFAULT_TC_ROUNDING,
} from '../engine';

const KEY = 'bj-trainer:v1';

export interface Prefs {
  rules: Rules;
  filter: DrillFilter;
  countVariant: CountVariant;
  countMode: CountMode;
  /** Seconds per card in the count drill. */
  countSeconds: number;
  tcSource: TrueCountSource;
  tcRounding: TrueCountRounding;
}

export const DEFAULT_PREFS: Prefs = {
  rules: { ...DEFAULT_RULES },
  filter: 'all',
  countVariant: 'single',
  countMode: 'learn',
  countSeconds: 2,
  tcSource: 'decks',
  tcRounding: DEFAULT_TC_ROUNDING,
};

export function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      return { ...DEFAULT_PREFS, ...parsed, rules: { ...DEFAULT_RULES, ...parsed.rules } };
    }
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  return { ...DEFAULT_PREFS, rules: { ...DEFAULT_RULES } };
}

export function save(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Not fatal: settings just won't persist.
  }
}
