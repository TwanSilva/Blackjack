import type { Action } from '../actions';
import type { Card } from '../cards';
import type { CountMode, CountVariant } from '../counting/countDrill';
import type { TrueCountSource } from '../counting/trueCountDrill';
import type { HandKind } from '../strategy/classes';
import { type DrillCell, cellKey, drillCells, parseCellKey } from '../strategy/drill';
import type { Advice } from '../strategy/oracle';
import { mistakeCost } from '../strategy/reasons';

/**
 * The player model: everything the trainer remembers about the player. Plain JSON, so it can be stored,
 * exported and imported as is. Functions here update it in place and take `now` so tests can control time.
 */

export interface CellRecord {
  attempts: number;
  correct: number;
  /** EV lost on this cell in total, per 100 bet. */
  lost: number;
  /** Spaced-repetition box: 0 = just missed, up to MAX_BOX = solid. */
  box: number;
  /** When the cell is due again (ms since epoch). */
  due: number;
  lastSeen: number;
}

export interface MistakeRecord {
  at: number;
  cell: string;
  player: Card[];
  upcard: Card;
  chosen: Action;
  best: Action;
  lossPer100: number;
}

export type SessionKind = 'strategy' | 'count' | 'true' | 'deviation' | 'bet' | 'table';

export interface SessionRecord {
  at: number;
  kind: SessionKind;
  /** "All hands", "Full deck test · test", "Read the discard tray". */
  label: string;
  total: number;
  correct: number;
  durationMs: number;
}

export interface CountRecord {
  at: number;
  variant: CountVariant;
  mode: CountMode;
  cards: number;
  secondsPerCard: number;
  /** Final count right (test) or every tap right (learning). */
  correct: boolean;
  /** Share of cards tapped right in learning mode, 1 or 0 in test mode. */
  accuracy: number;
  timeMs: number;
}

export interface Tally {
  attempts: number;
  correct: number;
}

export interface Progress {
  version: 1;
  cells: Record<string, CellRecord>;
  mistakes: MistakeRecord[];
  sessions: SessionRecord[];
  counts: CountRecord[];
  trueCounts: Partial<Record<TrueCountSource, Tally>>;
  /** Play-the-count answers per index row (by deviation id). */
  deviations: Record<string, Tally>;
  /** Bet sizing answers, from the bet drill and the table. */
  bets: Tally & { over: number; under: number };
  streak: { current: number; best: number };
  /** Strategy decision time, for speed stats and time estimates. */
  decisionTime: { totalMs: number; n: number };
  /** Set once the strategy drill has switched its default filter to weak spots. */
  weakDefaultApplied?: boolean;
}

export const MAX_BOX = 5;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Wait before a cell is due again, by box. A miss sends it back to box 0: due now. */
export const SR_INTERVALS_MS: readonly number[] = [0, 10 * MIN, HOUR, DAY, 3 * DAY, 7 * DAY];

export const MAX_MISTAKES = 200;
export const MAX_SESSIONS = 300;
export const MAX_COUNT_RUNS = 300;

export function emptyProgress(): Progress {
  return {
    version: 1,
    cells: {},
    mistakes: [],
    sessions: [],
    counts: [],
    trueCounts: {},
    deviations: {},
    bets: { attempts: 0, correct: 0, over: 0, under: 0 },
    streak: { current: 0, best: 0 },
    decisionTime: { totalMs: 0, n: 0 },
  };
}

function pushCapped<T>(list: T[], item: T, max: number): void {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
}

export interface DecisionInput {
  advice: Advice;
  chosen: Action;
  player: Card[];
  upcard: Card;
  /** Time the player took, if known. Very long waits are left out of the speed figures. */
  ms?: number;
  now: number;
}

/** Records one strategy decision: per-cell accuracy, spaced repetition, streak, mistake log. */
export function recordDecision(p: Progress, d: DecisionInput): void {
  if (!d.advice.chart) return; // only fresh two-card hands have a chart cell
  const key = cellKey({ cls: d.advice.hand, upcard: d.advice.upcard });
  const rec = p.cells[key] ?? { attempts: 0, correct: 0, lost: 0, box: 0, due: 0, lastSeen: 0 };
  const right = d.chosen === d.advice.best;
  rec.attempts++;
  rec.lastSeen = d.now;
  if (right) {
    rec.correct++;
    rec.box = Math.min(MAX_BOX, rec.box + 1);
    p.streak.current++;
    p.streak.best = Math.max(p.streak.best, p.streak.current);
  } else {
    const cost = mistakeCost(d.advice, d.chosen).lossPer100;
    rec.lost += cost;
    rec.box = 0;
    p.streak.current = 0;
    pushCapped(p.mistakes, {
      at: d.now, cell: key, player: d.player, upcard: d.upcard, chosen: d.chosen, best: d.advice.best, lossPer100: cost,
    }, MAX_MISTAKES);
  }
  rec.due = d.now + SR_INTERVALS_MS[rec.box];
  p.cells[key] = rec;
  if (d.ms !== undefined && d.ms > 0 && d.ms < 60_000) {
    p.decisionTime.totalMs += d.ms;
    p.decisionTime.n++;
  }
}

export function recordSession(p: Progress, s: SessionRecord): void {
  pushCapped(p.sessions, s, MAX_SESSIONS);
}

export function recordCountRun(p: Progress, r: CountRecord): void {
  pushCapped(p.counts, r, MAX_COUNT_RUNS);
}

export function recordBet(p: Progress, verdict: 'right' | 'over' | 'under'): void {
  p.bets.attempts++;
  if (verdict === 'right') p.bets.correct++;
  if (verdict === 'over') p.bets.over++;
  if (verdict === 'under') p.bets.under++;
}

export function recordDeviation(p: Progress, id: string, correct: boolean): void {
  const t = p.deviations[id] ?? { attempts: 0, correct: 0 };
  t.attempts++;
  if (correct) t.correct++;
  p.deviations[id] = t;
}

/** Play-the-count accuracy over every index row. */
export function deviationTotals(p: Progress): Tally {
  let attempts = 0;
  let correct = 0;
  for (const t of Object.values(p.deviations)) { attempts += t.attempts; correct += t.correct; }
  return { attempts, correct };
}

export function recordTrueCount(p: Progress, source: TrueCountSource, correct: boolean): void {
  const t = p.trueCounts[source] ?? { attempts: 0, correct: 0 };
  t.attempts++;
  if (correct) t.correct++;
  p.trueCounts[source] = t;
}

// ---------- Reading the model ----------

/**
 * A weak spot is a cell the player has missed and not yet fixed: it stays weak until it has been right
 * several times in a row and is mostly right overall. A cell that was never missed is not a weak spot.
 */
export function isWeak(rec: CellRecord | undefined): boolean {
  if (!rec || rec.attempts === 0 || rec.correct === rec.attempts) return false;
  return rec.box < 3 || rec.correct / rec.attempts < 0.8;
}

export type CellBand = 'unseen' | 'weak' | 'learning' | 'solid';

export const BAND_LABEL: Record<CellBand, string> = {
  unseen: 'Not played yet',
  weak: 'Weak: under 60% right, or missed last time',
  learning: 'Learning',
  solid: 'Solid: 90% or more, right several times in a row',
};

/** Heat-map rating of a cell. */
export function cellBand(rec: CellRecord | undefined): CellBand {
  if (!rec || rec.attempts === 0) return 'unseen';
  const acc = rec.correct / rec.attempts;
  if (acc < 0.6 || rec.box === 0) return 'weak';
  if (acc >= 0.9 && rec.box >= 3) return 'solid';
  return 'learning';
}

export interface WeakCell {
  cell: DrillCell;
  key: string;
  rec: CellRecord;
}

/** Weak cells, worst first: lowest box, then most EV lost. */
export function weakCells(p: Progress): WeakCell[] {
  const out: WeakCell[] = [];
  for (const [key, rec] of Object.entries(p.cells)) {
    if (!isWeak(rec)) continue;
    const cell = parseCellKey(key);
    if (cell) out.push({ cell, key, rec });
  }
  return out.sort((a, b) => a.rec.box - b.rec.box || b.rec.lost - a.rec.lost);
}

/**
 * How likely a cell is to be dealt next. Missed cells come back often, cells due for review come back,
 * cells answered right many times fade out until they are due again.
 */
export function cellWeight(rec: CellRecord | undefined, now: number): number {
  if (!rec || rec.attempts === 0) return 1;
  if (rec.due > now) return 0.15;
  if (rec.box === 0) return 8;
  return 1 + (MAX_BOX - rec.box);
}

export function accuracy(t: Tally | undefined): number | null {
  return t && t.attempts > 0 ? t.correct / t.attempts : null;
}

export function strategyTotals(p: Progress): Tally & { byKind: Record<HandKind, Tally> } {
  const byKind: Record<HandKind, Tally> = {
    hard: { attempts: 0, correct: 0 }, soft: { attempts: 0, correct: 0 }, pair: { attempts: 0, correct: 0 },
  };
  let attempts = 0;
  let correct = 0;
  for (const [key, rec] of Object.entries(p.cells)) {
    const kind = key.split('-')[0] as HandKind;
    byKind[kind].attempts += rec.attempts;
    byKind[kind].correct += rec.correct;
    attempts += rec.attempts;
    correct += rec.correct;
  }
  return { attempts, correct, byKind };
}

export function avgDecisionSeconds(p: Progress): number | null {
  return p.decisionTime.n > 0 ? p.decisionTime.totalMs / p.decisionTime.n / 1000 : null;
}

export function cellsSeen(p: Progress): number {
  return Object.values(p.cells).filter((c) => c.attempts > 0).length;
}

export function totalCells(): number {
  return drillCells('all').length;
}

/** The mistake log, newest first, one entry per cell. */
export function mistakesToReplay(p: Progress, max = 20): MistakeRecord[] {
  const seen = new Set<string>();
  const out: MistakeRecord[] = [];
  for (let i = p.mistakes.length - 1; i >= 0 && out.length < max; i--) {
    const m = p.mistakes[i];
    if (seen.has(m.cell)) continue;
    seen.add(m.cell);
    out.push(m);
  }
  return out;
}

export function bestDeckTime(p: Progress): number | null {
  const times = p.counts.filter((c) => c.variant === 'deck' && c.correct).map((c) => c.timeMs);
  return times.length ? Math.min(...times) : null;
}

// ---------- Import ----------

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Checks an imported file. Throws with a plain message when it isn't a progress export. */
export function parseProgress(json: unknown): Progress {
  if (!isObj(json) || json.version !== 1) throw new Error('This file is not a trainer progress export.');
  if (!isObj(json.cells) || !Array.isArray(json.mistakes) || !Array.isArray(json.sessions) || !Array.isArray(json.counts)) {
    throw new Error('This progress file is incomplete.');
  }
  for (const [key, rec] of Object.entries(json.cells)) {
    if (!parseCellKey(key) || !isObj(rec) || typeof rec.attempts !== 'number' || typeof rec.correct !== 'number') {
      throw new Error(`This progress file has a bad entry (${key}).`);
    }
  }
  const base = emptyProgress();
  return {
    ...base,
    ...(json as unknown as Progress),
    trueCounts: isObj(json.trueCounts) ? (json.trueCounts as Progress['trueCounts']) : {},
    deviations: isObj(json.deviations) ? (json.deviations as Progress['deviations']) : {},
    bets: isObj(json.bets) ? (json.bets as unknown as Progress['bets']) : base.bets,
    streak: isObj(json.streak) ? (json.streak as Progress['streak']) : base.streak,
    decisionTime: isObj(json.decisionTime) ? (json.decisionTime as Progress['decisionTime']) : base.decisionTime,
  };
}
