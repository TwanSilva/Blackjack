import { DEFAULT_RULES, type DrillFilter, type Rules } from '../engine';

const KEY = 'bj-trainer:v1';

interface Saved {
  rules: Rules;
  filter: DrillFilter;
}

export function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      return { rules: { ...DEFAULT_RULES, ...parsed.rules }, filter: parsed.filter ?? 'all' };
    }
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  return { rules: { ...DEFAULT_RULES }, filter: 'all' };
}

export function save(data: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Not fatal: settings just won't persist.
  }
}
