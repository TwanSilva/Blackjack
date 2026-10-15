import { DEVIATIONS } from '../strategy/deviations';
import {
  type Progress, type Tally, accuracy, avgDecisionSeconds, bestDeckTime, cellBand, deviationTotals, strategyTotals,
  totalCells,
} from './model';

/** The learning path (UX Blackjack.md, section 4). */
export type StageId = 'start' | 'chart' | 'counting' | 'playcount' | 'betting' | 'casino';

export interface StageInfo {
  id: StageId;
  name: string;
  /** What the stage covers, one line. */
  covers: string;
  /** The target that masters it, in plain words. */
  target: string;
}

export const STAGES: readonly StageInfo[] = [
  { id: 'start', name: 'Start here', covers: 'Rules, hand values, soft and hard hands, what each action does', target: '90% on 30 quiz questions' },
  { id: 'chart', name: 'The chart', covers: 'Basic strategy: hard totals, soft totals, pairs, surrender', target: '95% on your last 200 hands, every chart cell played, no weak spots' },
  { id: 'counting', name: 'Counting', covers: 'Hi-Lo values, running count, full deck, true count', target: 'A full deck to exactly 0, 4 of your last 5 count tests, 90% on 20 true counts' },
  { id: 'playcount', name: 'Playing the count', covers: 'The Illustrious 18, the Fab 4 and insurance at the right count', target: '90% on 60 hands, every index seen' },
  { id: 'betting', name: 'Betting', covers: 'Bet spread by true count, bankroll and risk', target: '95% on 40 bets' },
  { id: 'casino', name: 'Casino ready', covers: 'A full table with everything together', target: 'One session of 50+ rounds: 95% decisions, 90% bets, 80% count checks' },
];

/** 'skipped': before the starting stage chosen at onboarding, not started. 'locked': not reached yet (can still be opened). */
export type StageStatus = 'mastered' | 'in-progress' | 'up-next' | 'locked' | 'skipped';

export interface StageState extends StageInfo {
  status: StageStatus;
  /** 0 to 1: how far towards the target. */
  progress: number;
  /** Accuracy in the stage's drills, if any answers yet. */
  accuracy: number | null;
  /** Average seconds per answer, where measured. */
  speed: number | null;
}

function pct(t: Tally): number | null {
  return accuracy(t);
}

function clamp(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** How far each stage is, from the player model alone. Each returns [progress 0..1, accuracy, speed]. */
function measure(id: StageId, p: Progress): [number, number | null, number | null] {
  switch (id) {
    case 'start': {
      const acc = pct(p.lessons);
      const n = Math.min(1, p.lessons.attempts / 30);
      return [acc !== null && acc >= 0.9 ? n : n * 0.9, acc, null];
    }
    case 'chart': {
      const t = strategyTotals(p);
      const cells = Object.values(p.cells);
      const solid = cells.filter((c) => cellBand(c) === 'solid').length;
      const seen = cells.filter((c) => c.attempts > 0).length;
      const weak = cells.some((c) => cellBand(c) === 'weak');
      const acc = pct(t);
      const done = seen === totalCells() && !weak && acc !== null && acc >= 0.95 && t.attempts >= 200;
      return [done ? 1 : Math.min(0.99, (solid + seen) / (2 * totalCells())), acc, avgDecisionSeconds(p)];
    }
    case 'counting': {
      const tests = p.counts.filter((c) => c.mode === 'test').slice(-5);
      const testsOk = tests.filter((c) => c.correct).length;
      const tc = Object.values(p.trueCounts).reduce<Tally>((a, b) => ({ attempts: a.attempts + (b?.attempts ?? 0), correct: a.correct + (b?.correct ?? 0) }), { attempts: 0, correct: 0 });
      const tcAcc = pct(tc);
      const parts = [
        bestDeckTime(p) !== null ? 1 : 0,
        Math.min(1, testsOk / 4),
        tc.attempts >= 20 && tcAcc !== null && tcAcc >= 0.9 ? 1 : Math.min(0.9, tc.attempts / 20) * (tcAcc ?? 0),
      ];
      const all = p.counts.length ? p.counts.reduce((a, c) => a + c.accuracy, 0) / p.counts.length : null;
      const speed = p.counts.length ? Math.min(...p.counts.map((c) => c.secondsPerCard)) : null;
      return [parts.reduce((a, b) => a + b, 0) / 3, all, speed];
    }
    case 'playcount': {
      const t = deviationTotals(p);
      const acc = pct(t);
      const allSeen = DEVIATIONS.every((d) => (p.deviations[d.id]?.attempts ?? 0) > 0);
      const done = t.attempts >= 60 && acc !== null && acc >= 0.9 && allSeen;
      return [done ? 1 : Math.min(0.99, (t.attempts / 60) * (acc ?? 0)), acc, null];
    }
    case 'betting': {
      const acc = pct(p.bets);
      const done = p.bets.attempts >= 40 && acc !== null && acc >= 0.95;
      return [done ? 1 : Math.min(0.99, (p.bets.attempts / 40) * (acc ?? 0)), acc, null];
    }
    case 'casino': {
      const best = p.tables.filter((t) => t.rounds >= 50).find((t) => {
        const a = pct(t.plays) ?? 0;
        const b = pct(t.bets) ?? 0;
        const c = t.counts.attempts ? (pct(t.counts) ?? 0) : 1;
        return a >= 0.95 && b >= 0.9 && c >= 0.8;
      });
      const last = p.tables.at(-1);
      const acc = last ? pct(last.plays) : null;
      const prog = best ? 1 : last ? Math.min(0.99, (last.rounds / 50) * (acc ?? 0)) : 0;
      return [prog, acc, null];
    }
  }
}

/**
 * Every stage with its status. Stages are mastered by their target; the first stage that isn't mastered (or the
 * player's chosen starting stage, if later) is "up next" or "in progress"; stages after it are locked, which only
 * means not reached yet: the player can always jump ahead.
 */
export function pathState(p: Progress, startStage: StageId = 'start'): StageState[] {
  const startIndex = STAGES.findIndex((s) => s.id === startStage);
  let current = -1;
  const measured = STAGES.map((s) => {
    const [progress, acc, speed] = measure(s.id, p);
    return { ...s, progress: clamp(progress), accuracy: acc, speed };
  });
  for (let i = 0; i < measured.length; i++) {
    if (i < startIndex) continue;
    if (measured[i].progress < 1) { current = i; break; }
  }
  return measured.map((s, i) => {
    let status: StageStatus;
    if (s.progress >= 1) status = 'mastered';
    else if (i === current) status = s.progress > 0 ? 'in-progress' : 'up-next';
    else if (s.progress > 0) status = 'in-progress';
    else status = i < startIndex ? 'skipped' : 'locked';
    return { ...s, status };
  });
}

/** The stage to work on now: the first one not mastered, from the starting stage on. */
export function currentStage(p: Progress, startStage: StageId = 'start'): StageState {
  const st = pathState(p, startStage);
  const from = STAGES.findIndex((s) => s.id === startStage);
  return st.slice(from).find((s) => s.status !== 'mastered') ?? st[st.length - 1];
}
