import {
  type BetSpread, type CountMode, type CountVariant, type DrillFilter, type Progress, type Rules, type TrueCountRounding,
  type OnboardingAnswers, type StageId, type TrueCountSource, DEFAULT_RULES, DEFAULT_SPREAD, DEFAULT_UNIT_POTATOES, validateSpread, DEFAULT_TC_ROUNDING, emptyProgress, parseProgress, parseRounding,
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
  profile: Profile;
  display: DisplayPrefs;
  myCasino: MyCasino;
}

export interface Profile {
  onboarded: boolean;
  answers: OnboardingAnswers;
  startStage: StageId;
}

export type TextSize = 'normal' | 'large' | 'larger';
export interface DisplayPrefs {
  reduceMotion: boolean;
  textSize: TextSize;
  highContrast: boolean;
  sound: boolean;
  haptics: boolean;
}

export type ShuffleMethod = 'unknown' | 'hand' | 'machine' | 'continuous';
/**
 * The player's own casino (Casino da Póvoa by default). Unverified until every rule has been checked at the
 * table in person. Editing a rule after that makes it unverified again.
 */
export interface MyCasino {
  name: string;
  rules: Rules;
  /** Checklist items confirmed at the table, by id. */
  checked: Record<string, boolean>;
  tableMin: number | null;
  tableMax: number | null;
  shuffle: ShuffleMethod;
  verified: boolean;
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
  profile: { onboarded: false, answers: {}, startStage: 'start' },
  display: { reduceMotion: false, textSize: 'normal', highContrast: false, sound: false, haptics: true },
  myCasino: {
    name: 'Casino da Póvoa', rules: { ...DEFAULT_RULES }, checked: {}, tableMin: null, tableMax: null, shuffle: 'unknown', verified: false,
  },
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
        profile: { ...DEFAULT_PREFS.profile, ...parsed.profile },
        display: { ...DEFAULT_PREFS.display, ...parsed.display },
        myCasino: { ...DEFAULT_PREFS.myCasino, ...parsed.myCasino, rules: { ...DEFAULT_RULES, ...parsed.myCasino?.rules } },
      };
    }
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  return structuredClone(DEFAULT_PREFS);
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
