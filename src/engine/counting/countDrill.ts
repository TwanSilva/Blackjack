import type { Card } from '../cards';
import { playDealer } from '../dealer';
import { handValue } from '../hand';
import type { Rules } from '../rules';
import { type Rng, Shoe } from '../shoe';
import { bestPlay } from '../strategy/oracle';
import { type CountSystem, HI_LO, countValue } from './systems';

export type CountVariant = 'single' | 'pairs' | 'table' | 'deck';
export type CountMode = 'learn' | 'test';

export interface CountVariantInfo {
  id: CountVariant;
  name: string;
  detail: string;
  /** Learning mode taps +1 / 0 / −1 per card, so it needs one card per flash. */
  learnable: boolean;
}

export const COUNT_VARIANTS: readonly CountVariantInfo[] = [
  { id: 'single', name: 'Single cards', detail: '24 cards, one at a time', learnable: true },
  { id: 'pairs', name: 'Two-card hands', detail: '12 hands, two cards at once', learnable: false },
  { id: 'table', name: 'Full table', detail: '6 rounds: dealer and 3 players', learnable: false },
  { id: 'deck', name: 'Full deck test', detail: '52 cards, must end at exactly 0', learnable: true },
];

export interface Speed {
  id: 'relaxed' | 'standard' | 'fast' | 'pro';
  name: string;
  /** Seconds each card is shown. */
  seconds: number;
}

export const SPEEDS: readonly Speed[] = [
  { id: 'relaxed', name: 'Relaxed', seconds: 2 },
  { id: 'standard', name: 'Standard', seconds: 1.2 },
  { id: 'fast', name: 'Fast', seconds: 0.7 },
  { id: 'pro', name: 'Pro', seconds: 0.4 },
];

export const MIN_SECONDS = 0.2;
export const MAX_SECONDS = 5;

export interface TableLayout {
  dealer: Card[];
  players: Card[][];
}

export interface Flash {
  /** Cards shown together, in dealing order. */
  cards: Card[];
  /** Present for the full-table variant. */
  table?: TableLayout;
  /** Net count of this flash. */
  value: number;
  /** Running count after this flash. */
  runningAfter: number;
}

export interface CountSequence {
  variant: CountVariant;
  flashes: Flash[];
  cardCount: number;
  finalCount: number;
}

function toFlashes(groups: { cards: Card[]; table?: TableLayout }[], system: CountSystem): Flash[] {
  let rc = 0;
  return groups.map((g) => {
    const value = g.cards.reduce((s, c) => s + countValue(c, system), 0);
    rc += value;
    return { ...g, value, runningAfter: rc };
  });
}

/** One round at a table: three players play basic strategy against the dealer, then the dealer plays out. */
function dealRound(shoe: Shoe, rules: Rules): { cards: Card[]; table: TableLayout } {
  const players: Card[][] = [[], [], []];
  const dealer: Card[] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const p of players) p.push(shoe.draw());
    dealer.push(shoe.draw());
  }
  for (const p of players) {
    for (;;) {
      if (handValue(p).total >= 21) break;
      const best = bestPlay(p, dealer[0], rules).best;
      if (best === 'hit' || best === 'double') {
        p.push(shoe.draw());
        if (best === 'double') break;
      } else {
        // Stand, split and surrender all end the drawing here; splits are left out to keep the table readable.
        break;
      }
    }
  }
  const final = playDealer(dealer, () => shoe.draw(), rules);
  const cards = [...players.flat(), ...final];
  return { cards, table: { dealer: final, players } };
}

/** Builds a drill sequence from a freshly shuffled shoe with the table's deck count. */
export function buildCountSequence(
  variant: CountVariant,
  rules: Rules,
  rng: Rng = Math.random,
  system: CountSystem = HI_LO,
): CountSequence {
  const groups: { cards: Card[]; table?: TableLayout }[] = [];
  if (variant === 'deck') {
    const shoe = new Shoe(1, 1, rng);
    for (let i = 0; i < 52; i++) groups.push({ cards: [shoe.draw()] });
  } else {
    const shoe = new Shoe(rules.decks, rules.penetration, rng);
    if (variant === 'single') for (let i = 0; i < 24; i++) groups.push({ cards: [shoe.draw()] });
    if (variant === 'pairs') for (let i = 0; i < 12; i++) groups.push({ cards: [shoe.draw(), shoe.draw()] });
    if (variant === 'table') for (let i = 0; i < 6; i++) groups.push(dealRound(shoe, rules));
  }
  const flashes = toFlashes(groups, system);
  return {
    variant,
    flashes,
    cardCount: flashes.reduce((n, f) => n + f.cards.length, 0),
    finalCount: flashes.length ? flashes[flashes.length - 1].runningAfter : 0,
  };
}

/** How long a flash stays up: one card's time per card, a little faster per card for groups. */
export function flashMs(flash: Flash, secondsPerCard: number): number {
  const n = flash.cards.length;
  const factor = n === 1 ? 1 : n === 2 ? 0.85 : 0.6;
  return Math.round(secondsPerCard * 1000 * n * factor);
}

export interface ReviewStep {
  flash: Flash;
  index: number;
  /** Learning mode: what the player tapped, or null when the card timed out. */
  tapped?: number | null;
  right?: boolean;
}

/** Review rows: every flash with its running count, and in learning mode whether the tap was right. */
export function reviewSteps(seq: CountSequence, taps?: readonly (number | null)[]): ReviewStep[] {
  return seq.flashes.map((flash, index) => {
    if (!taps) return { flash, index };
    const tapped = taps[index] ?? null;
    return { flash, index, tapped, right: tapped === flash.value };
  });
}

export interface CountResult {
  correct: boolean;
  entered: number;
  actual: number;
  /** Learning mode only. */
  tapsRight?: number;
  tapsTotal?: number;
  /** Index of the first flash where the player's tapped running count went off, or null. */
  firstSlip?: number | null;
}

export function scoreLearning(seq: CountSequence, taps: readonly (number | null)[]): CountResult {
  const entered = taps.reduce<number>((s, t) => s + (t ?? 0), 0);
  let tapsRight = 0;
  let firstSlip: number | null = null;
  seq.flashes.forEach((f, i) => {
    if (taps[i] === f.value) tapsRight++;
    else if (firstSlip === null) firstSlip = i;
  });
  return {
    correct: tapsRight === seq.flashes.length,
    entered,
    actual: seq.finalCount,
    tapsRight,
    tapsTotal: seq.flashes.length,
    firstSlip,
  };
}

export function scoreTest(seq: CountSequence, entered: number): CountResult {
  return { correct: entered === seq.finalCount, entered, actual: seq.finalCount };
}
