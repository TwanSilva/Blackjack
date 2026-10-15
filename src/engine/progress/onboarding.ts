import type { DrillFilter } from '../strategy/drill';
import { STAGES, type StageId } from './path';

/** Onboarding (UX Blackjack.md, section 3): one question per screen, all skippable, all editable later. */

export interface OnboardingOption {
  id: string;
  label: string;
}

export interface OnboardingQuestion {
  id: QuestionId;
  title: string;
  multi: boolean;
  options: OnboardingOption[];
  /** Shown under the question. */
  note?: string;
}

export type QuestionId =
  | 'experience' | 'frequency' | 'where' | 'known' | 'system' | 'weak' | 'decide' | 'goals' | 'holding' | 'bankroll';

export const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  { id: 'experience', title: 'How much have you played?', multi: false, options: [
    { id: 'new', label: 'Brand new' },
    { id: 'instinct', label: 'I know the basics but play on instinct' },
    { id: 'solid', label: 'Solid player' },
    { id: 'experienced', label: 'Experienced: advanced play and counting' },
    { id: 'returning', label: 'I used to play and want to get sharp again' },
  ] },
  { id: 'frequency', title: 'How often do you play?', multi: false, options: [
    { id: 'yearly', label: 'A few times a year' }, { id: 'monthly', label: 'Monthly-ish' },
    { id: 'weekly', label: 'Weekly or more' }, { id: 'rarely', label: 'Rarely now' },
  ] },
  { id: 'where', title: 'Where do you play, or want to?', multi: false, options: [
    { id: 'casino', label: 'In-person casinos' }, { id: 'online', label: 'Online or live dealer' },
    { id: 'both', label: 'Both' }, { id: 'learning', label: 'Just learning' },
  ] },
  { id: 'known', title: 'What do you already know cold?', multi: true, options: [
    { id: 'hitstand', label: 'Hit and stand' }, { id: 'double', label: 'Double down' }, { id: 'split', label: 'Split' },
    { id: 'insurance', label: 'Insurance' }, { id: 'counting', label: 'Basic counting' }, { id: 'spread', label: 'Bet spreading' },
    { id: 'none', label: 'None yet' },
  ] },
  { id: 'system', title: 'Counting system', multi: false, note: 'Hi-Lo counts 2–6 as +1, 7–9 as 0, and 10 to Ace as −1. It is simple, balanced and the most widely taught. It is the only system in this version.', options: [
    { id: 'hilo', label: 'Hi-Lo' },
  ] },
  { id: 'weak', title: 'Where are you weakest?', multi: true, options: [
    { id: 'strategy', label: 'Basic strategy' }, { id: 'soft', label: 'Soft hands' }, { id: 'count', label: 'Keeping the count' },
    { id: 'adjust', label: 'Adjusting play to the count' }, { id: 'bets', label: 'Sizing bets' }, { id: 'calm', label: 'Staying calm' },
  ] },
  { id: 'decide', title: 'How do you decide at the table?', multi: false, options: [
    { id: 'gut', label: 'Gut feeling' }, { id: 'rules', label: 'A few rules I remember' },
    { id: 'basic', label: 'Basic strategy most of the time' }, { id: 'count', label: 'I adjust to the count' },
  ] },
  { id: 'goals', title: 'What do you want from this?', multi: true, options: [
    { id: 'mistakes', label: 'Stop making dumb mistakes' }, { id: 'confident', label: 'Feel confident' },
    { id: 'counting', label: 'Master card counting' }, { id: 'great', label: 'I love the game and want to get great at it' },
  ] },
  { id: 'holding', title: 'What’s holding you back?', multi: true, options: [
    { id: 'knowledge', label: 'I don’t know enough' }, { id: 'practice', label: 'I haven’t practised' },
    { id: 'emotion', label: 'Emotional decisions under pressure' }, { id: 'freeze', label: 'I freeze or second-guess' },
    { id: 'system', label: 'I never had a system' },
  ] },
  { id: 'bankroll', title: 'Practice bankroll', multi: false, note: 'In potatoes, practice currency only. Used at the table simulation.', options: [
    { id: 'small', label: 'Small' }, { id: 'medium', label: 'Medium' }, { id: 'large', label: 'Large' },
  ] },
];

/** "Why this matters" screens, shown after the question with this id. Only claims that are true. */
export const INTERSTITIALS: Partial<Record<QuestionId, { title: string; body: string }>> = {
  where: {
    title: 'Basic strategy is computed, not an opinion',
    body: 'For every hand and dealer card there is one play with the highest expected value under your table’s rules. This trainer computes each one; nothing is typed in from memory.',
  },
  weak: {
    title: 'Basic strategy cuts the house edge, it doesn’t beat it',
    body: 'Playing perfectly still leaves the casino a small edge, about half a percent at a typical 8-deck table. A small player edge only comes from counting and changing your bets with the count, and even then the swings are large.',
  },
  holding: {
    title: 'Practice happens away from the table',
    body: 'At the table you don’t have time to think. Drilling here until the right play is automatic is what keeps you calm there.',
  },
};

export type OnboardingAnswers = Partial<Record<QuestionId, string[]>>;

export interface OnboardingResult {
  startStage: StageId;
  /** "Here's where you start": one sentence each. */
  reasons: string[];
  /** Recommended order of stages from the start, with what to focus on. */
  path: { stage: StageId; focus: string }[];
  /** Default filter for the strategy drill. */
  filter: DrillFilter;
  bankroll: 'small' | 'medium' | 'large';
}

const has = (a: OnboardingAnswers, q: QuestionId, id: string) => (a[q] ?? []).includes(id);

/** Turns the answers into a starting stage and a recommended path. Unanswered questions change nothing. */
export function onboardingResult(a: OnboardingAnswers): OnboardingResult {
  const reasons: string[] = [];
  let start: StageId = 'start';
  const exp = a.experience?.[0];
  const knowsBasics = has(a, 'known', 'hitstand') && has(a, 'known', 'double') && has(a, 'known', 'split');
  const knowsCounting = has(a, 'known', 'counting');
  const knowsSpread = has(a, 'known', 'spread');

  if (exp === 'new' || has(a, 'known', 'none')) {
    start = 'start';
    reasons.push('You’re new to the game, so start with the rules and how hands are counted.');
  } else if (exp === 'experienced' && knowsCounting && knowsSpread && a.decide?.[0] === 'count') {
    start = 'playcount';
    reasons.push('You already count and adjust to it, so start with the count-based plays. The earlier stages stay open to check yourself.');
  } else if (exp === 'experienced' || (knowsCounting && a.decide?.[0] === 'basic')) {
    start = 'counting';
    reasons.push('You know the game well, so start with counting. Use the chart drills to confirm your basic strategy first if you like.');
  } else if (exp === 'instinct' || exp === 'solid' || exp === 'returning' || knowsBasics) {
    start = 'chart';
    reasons.push(exp === 'instinct' || a.decide?.[0] === 'gut'
      ? 'You know the rules but play on instinct, so start with the chart: it replaces guesses with the computed play.'
      : 'You know the rules, so start with the chart and make every play automatic.');
  } else {
    reasons.push('Start at the beginning; you can jump ahead any time.');
  }

  const focus: Partial<Record<StageId, string>> = {};
  if (has(a, 'weak', 'strategy')) focus.chart = 'Every chart cell until none are weak';
  if (has(a, 'weak', 'soft')) focus.chart = focus.chart ? `${focus.chart}, soft hands first` : 'Soft hands first';
  if (has(a, 'weak', 'count')) focus.counting = 'Full-deck tests until you hit 0 every time';
  if (has(a, 'weak', 'adjust')) focus.playcount = 'The Illustrious 18 and Fab 4';
  if (has(a, 'weak', 'bets')) focus.betting = 'Your spread, and why the bankroll matters';
  if (has(a, 'weak', 'calm') || has(a, 'holding', 'emotion') || has(a, 'holding', 'freeze')) {
    focus.casino = 'Pressure mode at the table, and the tilt guard';
    reasons.push('Staying calm is trained at the table simulation with pressure mode on, once the basics are automatic.');
  }
  if (has(a, 'goals', 'counting') && start === 'start') reasons.push('Counting comes after the chart: it only pays once basic strategy is perfect.');
  if (a.where?.[0] === 'online') reasons.push('Online random-number games and continuous shufflers can’t be counted; basic strategy still matters there.');

  const startIndex = STAGES.findIndex((s) => s.id === start);
  const path = STAGES.slice(startIndex).map((s) => ({ stage: s.id, focus: focus[s.id] ?? s.covers }));
  const filter: DrillFilter = has(a, 'weak', 'soft') ? 'soft' : 'all';
  const bankroll = (a.bankroll?.[0] as OnboardingResult['bankroll']) ?? 'medium';
  return { startStage: start, reasons, path, filter, bankroll };
}
