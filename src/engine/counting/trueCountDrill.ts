import type { Rules } from '../rules';
import { type Rng, Shoe } from '../shoe';
import { CountTracker, type TrueCountRounding, estimateDecks, explainTrueCount, trueCount } from './count';
import { type CountSystem, HI_LO } from './systems';

export type TrueCountSource = 'decks' | 'cards' | 'tray';

export const TRUE_COUNT_SOURCES: readonly { id: TrueCountSource; name: string; detail: string }[] = [
  { id: 'decks', name: 'Decks remaining given', detail: 'Running count and decks left, to the half deck' },
  { id: 'cards', name: 'Cards remaining given', detail: 'Running count and the exact cards left' },
  { id: 'tray', name: 'Read the discard tray', detail: 'Estimate decks left from the tray, then divide' },
];

export interface TrueCountQuestion {
  source: TrueCountSource;
  running: number;
  shoeDecks: number;
  cardsRemaining: number;
  cardsDiscarded: number;
  /** Decks remaining used for the answer: the half-deck estimate, or the exact figure when cards are given. */
  decksForAnswer: number;
  answer: number;
  rounding: TrueCountRounding;
}

/** A real position in a shoe: cards are dealt from a shuffled shoe and counted, never made up. */
export function makeTrueCountQuestion(
  source: TrueCountSource,
  rules: Rules,
  rounding: TrueCountRounding,
  rng: Rng = Math.random,
  system: CountSystem = HI_LO,
): TrueCountQuestion {
  const shoe = new Shoe(rules.decks, rules.penetration, rng);
  const tracker = new CountTracker(rules.decks, system);
  // Somewhere between a quarter deck in and the cut card, always leaving at least a quarter deck.
  const minDealt = 13;
  const maxDealt = Math.min(Math.round(shoe.size * rules.penetration), shoe.size - 13);
  const dealt = minDealt + Math.floor(rng() * (maxDealt - minDealt + 1));
  for (let i = 0; i < dealt; i++) tracker.see(shoe.draw());
  const cardsRemaining = tracker.cardsRemaining;
  const decksForAnswer = source === 'cards' ? cardsRemaining / 52 : estimateDecks(cardsRemaining);
  return {
    source,
    running: tracker.running,
    shoeDecks: rules.decks,
    cardsRemaining,
    cardsDiscarded: tracker.cardsSeen,
    decksForAnswer,
    answer: trueCount(tracker.running, decksForAnswer, rounding),
    rounding,
  };
}

/** Half-deck choices for reading the tray. */
export function deckChoices(shoeDecks: number): number[] {
  const out: number[] = [];
  for (let d = 0.5; d <= shoeDecks; d += 0.5) out.push(d);
  return out;
}

export interface TrueCountGrade {
  correct: boolean;
  /** The true count the answer was checked against. */
  expected: number;
  /** Tray only: the deck estimate was within half a deck of the real figure. */
  deckEstimateOk?: boolean;
  explanation: string;
}

/**
 * Grades an answer. For the tray, a deck estimate within half a deck of the truth is accepted, and the
 * true count is then checked against the player's own estimate, because that's what they'd use at the table.
 */
export function gradeTrueCount(q: TrueCountQuestion, entered: number, deckEstimate?: number): TrueCountGrade {
  const lines: string[] = [];
  let divisor = q.decksForAnswer;
  let deckEstimateOk: boolean | undefined;
  if (q.source === 'cards') {
    lines.push(`${q.cardsRemaining} cards ÷ 52 = ${(q.cardsRemaining / 52).toFixed(2)} decks.`);
  }
  if (q.source === 'tray' && deckEstimate !== undefined) {
    const actual = q.cardsRemaining / 52;
    deckEstimateOk = Math.abs(deckEstimate - actual) <= 0.5;
    lines.push(
      `${q.cardsDiscarded} cards are in the tray, so ${q.cardsRemaining} are left: ${actual.toFixed(1)} decks, about ${q.decksForAnswer} to the half deck.`,
    );
    if (deckEstimateOk) divisor = deckEstimate;
  }
  const expected = trueCount(q.running, divisor, q.rounding);
  lines.push(explainTrueCount(q.running, divisor, q.rounding));
  return {
    correct: entered === expected && (deckEstimateOk ?? true),
    expected,
    deckEstimateOk,
    explanation: lines.join(' '),
  };
}
