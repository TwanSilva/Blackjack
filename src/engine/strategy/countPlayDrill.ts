import type { Action } from '../actions';
import { type Card, type Rank, SUITS, cardPip } from '../cards';
import { type TrueCountRounding, explainTrueCount, roundDecks, trueCount } from '../counting/count';
import { pipsValue } from '../hand';
import type { Rules } from '../rules';
import type { Rng } from '../shoe';
import { compositions } from './classes';
import { type DeviationIndex, DEVIATIONS, describeDeviation } from './deviations';
import { explainCountDecision } from './countPlay';
import { holeFor } from './drill';
import { type Advice, bestPlay } from './oracle';

export type CountPlayMode = 'shown' | 'hidden';

export const COUNT_PLAY_MODES: readonly { id: CountPlayMode; name: string; detail: string }[] = [
  { id: 'shown', name: 'True count shown', detail: 'Learn the index numbers' },
  { id: 'hidden', name: 'Work out the true count', detail: 'Running count and decks left: divide, round down, then play' },
];

export type CountPlayAnswer = Action | 'insurance' | 'no-insurance';

export interface CountPlayQuestion {
  row: DeviationIndex;
  player: Card[];
  upcard: Card;
  hole: Card;
  trueCount: number;
  /** Hidden mode: what the player is shown instead of the true count. */
  running?: number;
  decksLeft?: number;
  answer: CountPlayAnswer;
  /** Basic strategy for the same hand, for the feedback. */
  basic: CountPlayAnswer;
  /** The oracle's advice at this count (null for insurance questions). */
  advice: Advice | null;
  rounding: TrueCountRounding;
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

const TENS: readonly Rank[] = ['10', 'J', 'Q', 'K'];
function cardFor(pip: number, rng: Rng): Card {
  const rank: Rank = pip === 1 ? 'A' : pip === 10 ? pick(TENS, rng) : (String(pip) as Rank);
  return { rank, suit: pick(SUITS, rng) };
}

/** Hands that make the row's total: the two-card ones, plus three-card hard totals for stand/hit rows. */
function candidateHands(row: DeviationIndex): number[][] {
  const cls = row.hand!;
  const two = compositions(cls).map(([a, b]) => [a, b]);
  if (row.atOrAbove !== 'stand' || row.below !== 'hit' || cls.kind !== 'hard') return two;
  const three: number[][] = [];
  for (let a = 2; a <= 10; a++) {
    for (let b = a; b <= 10; b++) {
      const c = cls.total - a - b;
      if (c >= b && c <= 10 && !pipsValue([a, b, c]).soft) three.push([a, b, c]);
    }
  }
  return [...two, ...three];
}

/** True when the count flips the answer for this hand: one play at the index, another one below. */
function countMatters(cards: Card[], up: Card, rules: Rules, index: number, rounding: TrueCountRounding): boolean {
  const at = bestPlay(cards, up, rules, { value: index, rounding });
  const below = bestPlay(cards, up, rules, { value: index - 1, rounding });
  return !at.count?.warning && at.best !== below.best;
}

/** Running count and decks left that floor (or round) to `tc`, from a real-looking spot in the shoe. */
function hiddenCount(tc: number, rules: Rules, rounding: TrueCountRounding, rng: Rng): { running: number; decksLeft: number } {
  const max = Math.max(1, rules.decks - 1);
  for (let tries = 0; tries < 50; tries++) {
    const decksLeft = roundDecks(1 + rng() * (max - 1 + 0.5));
    const lo = Math.floor((tc - 1.5) * decksLeft);
    const hi = Math.ceil((tc + 1.5) * decksLeft);
    const options: number[] = [];
    for (let rc = lo; rc <= hi; rc++) if (trueCount(rc, decksLeft, rounding) === tc) options.push(rc);
    if (options.length) return { running: pick(options, rng), decksLeft };
  }
  return { running: tc * 2, decksLeft: 2 };
}

/**
 * A play-the-count question: a row of the index table, a true count near its index (two below to two above),
 * and a hand where the count really changes the answer under these rules.
 */
export function makeCountPlayQuestion(
  rules: Rules,
  rounding: TrueCountRounding,
  mode: CountPlayMode,
  rng: Rng = Math.random,
): CountPlayQuestion {
  for (let attempt = 0; attempt < 200; attempt++) {
    const row = pick(DEVIATIONS, rng);
    const offset = pick([-2, -1, 0, 1, 2], rng);
    const up = cardFor(row.upcard, rng);

    if (row.group === 'insurance') {
      const tc = row.index + offset;
      let player: Card[];
      do player = [cardFor(Math.floor(rng() * 10) + 1, rng), cardFor(Math.floor(rng() * 10) + 1, rng)];
      while (pipsValue(player.map(cardPip)).total === 21); // no player blackjack
      const take = bestPlay(player, up, rules, { value: tc, rounding }).insurance!;
      if (take.take === null) continue;
      return {
        // Insurance is decided before the peek, so the hidden hole card can be anything.
        row, player, upcard: up, hole: holeFor(1, { ...rules, dealerPeeks: false }, rng), trueCount: tc,
        ...(mode === 'hidden' ? hiddenCount(tc, rules, rounding, rng) : {}),
        answer: take.take ? 'insurance' : 'no-insurance', basic: 'no-insurance', advice: null, rounding,
      };
    }

    const hands = candidateHands(row).sort(() => rng() - 0.5);
    for (const pips of hands) {
      const cards = (rng() < 0.5 ? pips : [...pips].reverse()).map((p) => cardFor(p, rng));
      // Which index decides this hand: Fab 4 rows on two cards, the in-game index on three.
      const probe = bestPlay(cards, up, rules, { value: row.index, rounding });
      const used = probe.count?.applied.find((a) => a.row.id === row.id);
      if (!used) continue;
      if (!countMatters(cards, up, rules, used.index, rounding)) continue;
      const tc = used.index + offset;
      const advice = bestPlay(cards, up, rules, { value: tc, rounding });
      return {
        row, player: cards, upcard: up, hole: holeFor(row.upcard, rules, rng), trueCount: tc,
        ...(mode === 'hidden' ? hiddenCount(tc, rules, rounding, rng) : {}),
        answer: advice.best, basic: advice.basicBest, advice, rounding,
      };
    }
  }
  throw new Error('No play-the-count question fits these rules');
}

export function isCorrect(q: CountPlayQuestion, answer: CountPlayAnswer): boolean {
  return answer === q.answer;
}

/** Feedback text for a question: the index that applied and why, plus the true count sum in hidden mode. */
export function explainCountPlay(q: CountPlayQuestion): string {
  const sum = q.running !== undefined && q.decksLeft !== undefined ? `${explainTrueCount(q.running, q.decksLeft, q.rounding)} ` : '';
  if (q.row.group === 'insurance') {
    const at = q.trueCount >= q.row.index;
    return `${sum}${describeDeviation(q.row)} True count ${q.trueCount > 0 ? '+' : ''}${q.trueCount} is ${at ? 'at or above' : 'below'} +${q.row.index}, so ${at ? 'take insurance' : 'decline it'}. Basic strategy never takes insurance.`;
  }
  return `${sum}${explainCountDecision(q.advice!.count!, q.advice!.basicBest, q.trueCount, q.rounding)}`;
}

