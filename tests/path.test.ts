import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RULES, DEVIATIONS, adviseClass, allClasses, currentStage, emptyProgress, onboardingResult, pathState, recordBet,
  recordCountRun, recordDecision, recordDeviation, recordLesson, recordTable, recordTrueCount, UPCARDS, type Card,
} from '../src/engine';

const T0 = 1_800_000_000_000;
const c = (rank: Card['rank']): Card => ({ rank, suit: 'spades' });
const status = (p: ReturnType<typeof emptyProgress>, start: Parameters<typeof pathState>[1] = 'start') =>
  Object.fromEntries(pathState(p, start).map((s) => [s.id, s.status]));

describe('learning path', () => {
  test('a new player starts at "Start here"; everything else is locked (but can still be opened)', () => {
    expect(status(emptyProgress())).toEqual({
      start: 'up-next', chart: 'locked', counting: 'locked', playcount: 'locked', betting: 'locked', casino: 'locked',
    });
  });

  test('starting further along marks earlier untouched stages as skipped', () => {
    const s = status(emptyProgress(), 'chart');
    expect(s.start).toBe('skipped');
    expect(s.chart).toBe('up-next');
  });

  test('30 lesson answers at 90% or better master "Start here"', () => {
    const p = emptyProgress();
    for (let i = 0; i < 30; i++) recordLesson(p, i % 15 !== 0); // 28 of 30
    expect(status(p).start).toBe('mastered');
    expect(status(p).chart).toBe('up-next');
  });

  test('the chart is mastered only with every cell played, no weak spots and 95% over 200 hands', () => {
    const p = emptyProgress();
    for (let i = 0; i < 30; i++) recordLesson(p, true);
    for (let round = 0; round < 3; round++) {
      for (const cls of allClasses()) {
        for (const up of UPCARDS) {
          const advice = adviseClass(cls, up, DEFAULT_RULES);
          recordDecision(p, { advice, chosen: advice.best, player: [c('10'), c('2')], upcard: c('5'), now: T0 });
        }
      }
    }
    expect(status(p).chart).toBe('mastered');
    // One fresh miss makes a weak spot and un-masters it.
    const a = adviseClass(allClasses()[0], 2, DEFAULT_RULES);
    recordDecision(p, { advice: a, chosen: a.best === 'hit' ? 'stand' : 'hit', player: [c('2'), c('3')], upcard: c('2'), now: T0 });
    expect(status(p).chart).toBe('in-progress');
  });

  test('counting, playing the count, betting and the table each master on their targets', () => {
    const p = emptyProgress();
    recordCountRun(p, { at: T0, variant: 'deck', mode: 'test', cards: 52, secondsPerCard: 0.7, correct: true, accuracy: 1, timeMs: 40000 });
    for (let i = 0; i < 4; i++) recordCountRun(p, { at: T0, variant: 'single', mode: 'test', cards: 24, secondsPerCard: 1, correct: true, accuracy: 1, timeMs: 30000 });
    for (let i = 0; i < 20; i++) recordTrueCount(p, 'decks', true);
    expect(status(p).counting).toBe('mastered');

    for (const d of DEVIATIONS) for (let i = 0; i < 3; i++) recordDeviation(p, d.id, true);
    expect(status(p).playcount).toBe('mastered');

    for (let i = 0; i < 40; i++) recordBet(p, 'right');
    expect(status(p).betting).toBe('mastered');

    recordTable(p, { at: T0, rounds: 30, net: 50, plays: { attempts: 40, correct: 40 }, bets: { attempts: 30, correct: 30 }, counts: { attempts: 5, correct: 5 } });
    expect(status(p).casino).not.toBe('mastered'); // fewer than 50 rounds
    recordTable(p, { at: T0, rounds: 60, net: -20, plays: { attempts: 80, correct: 77 }, bets: { attempts: 60, correct: 56 }, counts: { attempts: 10, correct: 9 } });
    expect(status(p).casino).toBe('mastered');
  });
});

describe('onboarding', () => {
  test('brand new players start at the beginning', () => {
    expect(onboardingResult({ experience: ['new'] }).startStage).toBe('start');
    expect(onboardingResult({}).startStage).toBe('start');
  });

  test('instinct players start with the chart', () => {
    const r = onboardingResult({ experience: ['instinct'], decide: ['gut'] });
    expect(r.startStage).toBe('chart');
    expect(r.reasons[0]).toMatch(/instinct/);
  });

  test('experienced counters who bet and play the count start with the count plays', () => {
    const r = onboardingResult({ experience: ['experienced'], known: ['hitstand', 'double', 'split', 'counting', 'spread'], decide: ['count'] });
    expect(r.startStage).toBe('playcount');
    expect(r.path.map((x) => x.stage)).toEqual(['playcount', 'betting', 'casino']);
  });

  test('weak areas shape the focus, soft hands set the drill filter, and the bankroll answer is kept', () => {
    const r = onboardingResult({ experience: ['solid'], weak: ['soft', 'calm'], bankroll: ['large'] });
    expect(r.filter).toBe('soft');
    expect(r.bankroll).toBe('large');
    expect(r.path.find((x) => x.stage === 'chart')!.focus).toMatch(/soft hands first/i);
    expect(r.path.find((x) => x.stage === 'casino')!.focus).toMatch(/Pressure mode/);
  });

  test('online players are told what can’t be counted', () => {
    expect(onboardingResult({ where: ['online'] }).reasons.join(' ')).toMatch(/can’t be counted/);
  });
});

describe('current stage', () => {
  test('is the first unmastered stage from the starting point, even if an earlier one has some progress', () => {
    const p = emptyProgress();
    for (let i = 0; i < 5; i++) recordLesson(p, true); // a little progress on "Start here"
    expect(currentStageId(p, 'chart')).toBe('chart');
    expect(currentStageId(p, 'start')).toBe('start');
  });
});

function currentStageId(p: ReturnType<typeof emptyProgress>, start: Parameters<typeof pathState>[1]) {
  return currentStage(p, start).id;
}
