import {
  type BetSpread, type CountMode, type CountVariant, type DrillFilter, type Progress, type Rules, type TrueCountRounding,
  type TrueCountSource, DEFAULT_RULES, DEFAULT_SPREAD, DEFAULT_UNIT_POTATOES, validateSpread, DEFAULT_TC_ROUNDING, emptyProgress, parseProgress, parseRounding,
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
  spread: BetSpread;
  unitPotatoes: number;
  bankrollSize: BankrollSize;
  table: TablePrefs;
}

export type BankrollSize = 'small' | 'medium' | 'large';
/** Practice bankroll in units of the bet: small, medium, large. */
export const BANKROLL_UNITS: Record<BankrollSize, number> = { small: 50, medium: 200, large: 1000 };

export interface TablePrefs {
  others: number;
  hints: boolean;
  pressure: boolean;
  /** Ask for the running count every this many rounds; 0 = never. */
  countCheckEvery: number;
}

export const DEFAULT_PREFS: Prefs = {
  rules: { ...DEFAULT_RULES },
  filter: 'all',
  countVariant: 'single',
  countMode: 'learn',
  countSeconds: 2,
  tcSource: 'decks',
  tcRounding: DEFAULT_TC_ROUNDING,
  spread: { base: DEFAULT_SPREAD.base, steps: DEFAULT_SPREAD.steps.map((x) => ({ ...x })) },
  unitPotatoes: DEFAULT_UNIT_POTATOES,
  bankrollSize: 'medium',
  table: { others: 2, hints: false, pressure: false, countCheckEvery: 6 },
};

export function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      return {
        ...DEFAULT_PREFS,
        ...parsed,
        rules: { ...DEFAULT_RULES, ...parsed.rules },
        tcRounding: parseRounding(parsed.tcRounding),
        spread: parsed.spread && validateSpread(parsed.spread).length === 0 ? parsed.spread : DEFAULT_PREFS.spread,
        table: { ...DEFAULT_PREFS.table, ...parsed.table },
      };
    }
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  return { ...DEFAULT_PREFS, rules: { ...DEFAULT_RULES }, spread: structuredClone(DEFAULT_PREFS.spread), table: { ...DEFAULT_PREFS.table } };
}

export function save(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Not fatal: settings just won't persist.
  }
}

const PROGRESS_KEY = 'bj-trainer:progress:v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return parseProgress(JSON.parse(raw));
  } catch {
    // Storage blocked or corrupt: start fresh rather than crash.
  }
  return emptyProgress();
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // Not fatal: this session's progress just won't persist.
  }
}
