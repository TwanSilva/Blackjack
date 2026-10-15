import { pipName } from '../cards';
import { COUNT_VARIANTS, type CountVariant } from '../counting/countDrill';
import { TRUE_COUNT_SOURCES, type TrueCountSource } from '../counting/trueCountDrill';
import type { Rng } from '../shoe';
import { type HandKind, classLabel } from '../strategy/classes';
import { type DrillCell, type DrillFilter, cellKey, drillCells } from '../strategy/drill';
import {
  type Progress, accuracy, avgDecisionSeconds, bestDeckTime, cellWeight, deviationTotals, strategyTotals, weakCells,
} from './model';

/** A missed cell comes back this many hands later in the same session. */
export const RETRY_AFTER = 3;

/**
 * Picks the next cell for a strategy session. Cells are weighted by the spaced-repetition model, and a
 * cell missed in this session is queued to come back a few hands later.
 */
export class DrillScheduler {
  private readonly retry: { cell: DrillCell; at: number }[] = [];
  private readonly retried = new Set<string>();
  private readonly pool: DrillCell[];
  /** True when the weak-spots filter had nothing weak and fell back to all hands. */
  readonly fellBack: boolean = false;

  constructor(
    filter: DrillFilter,
    private readonly progress: Progress,
    private readonly rng: Rng = Math.random,
  ) {
    if (filter === 'weak') {
      const weak = weakCells(progress).map((w) => w.cell);
      this.fellBack = weak.length === 0;
      this.pool = weak.length > 0 ? weak : drillCells('all');
    } else {
      this.pool = drillCells(filter);
    }
  }

  next(handIndex: number, now: number): DrillCell {
    const i = this.retry.findIndex((r) => r.at <= handIndex);
    if (i >= 0) return this.retry.splice(i, 1)[0].cell;
    const weights = this.pool.map((c) => cellWeight(this.progress.cells[cellKey(c)], now));
    const total = weights.reduce((a, b) => a + b, 0);
    let x = this.rng() * total;
    for (let k = 0; k < this.pool.length; k++) {
      x -= weights[k];
      if (x <= 0) return this.pool[k];
    }
    return this.pool[this.pool.length - 1];
  }

  /**
   * Queues a missed cell to come back once, a few hands later. A cell is retried at most once per
   * session, so a hand the player keeps missing can't crowd out the rest of the session; the
   * spaced-repetition weights bring it back in later sessions.
   */
  missed(cell: DrillCell, handIndex: number): void {
    const key = cellKey(cell);
    if (this.retried.has(key)) return;
    this.retried.add(key);
    this.retry.push({ cell, at: handIndex + RETRY_AFTER });
  }
}

export interface Practice {
  kind: 'strategy' | 'count' | 'true' | 'deviation' | 'bet' | 'table';
  /** One line naming what to work on. */
  title: string;
  /** "About 10 min · 80 hands". */
  detail: string;
  filter?: DrillFilter;
  countVariant?: CountVariant;
  tcSource?: TrueCountSource;
  /** Strategy hands, count cards or true count questions. */
  size: number;
}

const KIND_NAME: Record<HandKind, string> = { hard: 'hard totals', soft: 'soft totals', pair: 'pairs' };
const DEFAULT_SECONDS_PER_HAND = 6;

function minutes(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return `About ${m} min`;
}

/**
 * The roughly ten-minute drill most likely to help right now, from the player's own mistakes.
 * `countPlayAvailable` is false when the index table doesn't fit the player's rules or rounding.
 */
export function todaysPractice(p: Progress, countPlayAvailable = true): Practice {
  const secsPerHand = avgDecisionSeconds(p) ?? DEFAULT_SECONDS_PER_HAND;
  const hands = Math.min(100, Math.max(20, Math.round(600 / (secsPerHand + 1.5) / 10) * 10));
  const strategy = strategyTotals(p);
  const weak = weakCells(p);

  if (strategy.attempts === 0) {
    return {
      kind: 'strategy', title: 'Basic strategy: every kind of hand', filter: 'all', size: 20,
      detail: `${minutes(20 * (secsPerHand + 1.5))} · 20 hands`,
    };
  }

  if (weak.length > 0) {
    // Name the kind of hand that costs the most, and the single worst cell in it.
    const lostByKind = new Map<HandKind, number>();
    for (const w of weak) lostByKind.set(w.cell.cls.kind, (lostByKind.get(w.cell.cls.kind) ?? 0) + w.rec.lost);
    const kind = [...lostByKind].sort((a, b) => b[1] - a[1])[0][0];
    const worst = weak.filter((w) => w.cell.cls.kind === kind).sort((a, b) => b.rec.lost - a.rec.lost)[0];
    const where = `${classLabel(worst.cell.cls)} against ${pipName(worst.cell.upcard)}`;
    return {
      kind: 'strategy',
      title: `Your weak spots, led by ${KIND_NAME[kind]}: ${where}`,
      filter: 'weak',
      size: hands,
      detail: `${minutes(hands * (secsPerHand + 1.5))} · ${hands} hands · ${weak.length} weak spot${weak.length === 1 ? '' : 's'}`,
    };
  }

  const tests = p.counts.filter((c) => c.mode === 'test').slice(-5);
  const testAcc = tests.length ? tests.filter((c) => c.correct).length / tests.length : null;
  if (p.counts.length === 0 || (testAcc !== null && testAcc < 0.6) || bestDeckTime(p) === null) {
    const variant: CountVariant = p.counts.length === 0 ? 'single' : 'deck';
    const info = COUNT_VARIANTS.find((v) => v.id === variant)!;
    return {
      kind: 'count',
      title: variant === 'deck' ? 'Count a full deck down to exactly 0' : 'Keep the Hi-Lo running count, card by card',
      countVariant: variant,
      size: variant === 'deck' ? 52 : 24,
      detail: `${minutes(variant === 'deck' ? 4 * 60 : 3 * 60)} · ${info.name.toLowerCase()} · repeat a few times`,
    };
  }

  const tcSources = TRUE_COUNT_SOURCES.map((s) => ({ s, acc: accuracy(p.trueCounts[s.id]) }));
  const weakTc = tcSources.find((t) => t.acc === null || t.acc < 0.8);
  if (weakTc) {
    return {
      kind: 'true',
      title: `True count: ${weakTc.s.name.toLowerCase()}`,
      tcSource: weakTc.s.id,
      size: 10,
      detail: `${minutes(10 * 15)} · 10 questions`,
    };
  }

  const dev = deviationTotals(p);
  if (countPlayAvailable && (dev.attempts < 20 || dev.correct / dev.attempts < 0.85)) {
    return {
      kind: 'deviation',
      title: 'Play the count: the Illustrious 18 and Fab 4',
      size: 20,
      detail: `${minutes(20 * 10)} · 20 hands`,
    };
  }

  if (p.bets.attempts < 20 || p.bets.correct / p.bets.attempts < 0.9) {
    return { kind: 'bet', title: 'Size your bets from the true count', size: 20, detail: `${minutes(20 * 6)} · 20 counts` };
  }

  if (!p.sessions.some((s) => s.kind === 'table')) {
    return { kind: 'table', title: 'Put it together at a full table', size: 40, detail: 'About 15 min · as many rounds as you like' };
  }

  return {
    kind: 'strategy',
    title: 'Mixed review: hands due for a check',
    filter: 'all',
    size: hands,
    detail: `${minutes(hands * (secsPerHand + 1.5))} · ${hands} hands`,
  };
}
