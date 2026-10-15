import { type Card, type Rank, RANKS, SUITS } from '../cards';
import { playDealer } from '../dealer';
import { handValue, isBlackjack } from '../hand';
import { settleHand } from '../payout';
import type { Rules } from '../rules';
import type { Rng } from '../shoe';

/**
 * "Start here" (stage 1): rules, hand values, soft and hard hands, what each action does.
 * The text states the rules of the game. Every quiz answer is computed by the game engine.
 */

export type LessonId = 'values' | 'soft' | 'actions' | 'outcomes';

export interface Lesson {
  id: LessonId;
  title: string;
  /** A few short paragraphs. Functions of the rules where the rules matter. */
  body: (rules: Rules) => string[];
}

export const LESSONS: readonly Lesson[] = [
  {
    id: 'values',
    title: 'Hand values',
    body: () => [
      'You and the dealer each try to get closer to 21 than the other without going over.',
      'Cards 2 to 10 count as their number. Jack, Queen and King count 10. An Ace counts 1 or 11, whichever is better for the hand.',
      'Going over 21 is a bust: you lose at once, even if the dealer busts later.',
    ],
  },
  {
    id: 'soft',
    title: 'Soft and hard hands',
    body: () => [
      'A hand is soft when an Ace is being counted as 11. Ace and 6 is soft 17: one more card can never bust it, because the Ace can drop back to 1.',
      'A hand is hard when it has no Ace, or every Ace has to count 1. Ace, 6 and 10 is hard 17.',
      'An Ace and a ten-value card as your first two cards is a blackjack, the best hand.',
    ],
  },
  {
    id: 'actions',
    title: 'What each action does',
    body: (r) => [
      'Hit: take another card. Stand: take no more cards.',
      `Double: double your bet and take exactly one more card${r.doubleOn === 'any' ? ', on any first two cards' : r.doubleOn === '9-11' ? ', only on a total of 9 to 11' : ', only on 10 or 11'}.`,
      `Split: two cards of the same value become two hands, each with its own bet${r.doubleAfterSplit ? '; you can double after splitting at this table' : ''}.`,
      r.surrender === 'late'
        ? 'Surrender: give up the hand and get half your bet back. Only on your first two cards, after the dealer checks for blackjack.'
        : 'Surrender is not offered at this table.',
      r.dealerPeeks
        ? 'With a 10 or an Ace showing, the dealer checks for blackjack before you play; if it is there, the hand ends and you lose only your original bet.'
        : 'This table has no hole card: the dealer takes the second card after you play, and a dealer blackjack takes doubled and split bets too.',
    ],
  },
  {
    id: 'outcomes',
    title: 'Who wins and what it pays',
    body: (r) => [
      `The dealer plays last, with no choices: hit until 17 or more, ${r.hitSoft17 ? 'and also hit a soft 17 (this table is H17)' : 'and stand on every 17, soft ones included (this table is S17)'}.`,
      'If the dealer busts, every hand still in play wins. Otherwise the higher total wins, and equal totals push (you get your bet back).',
      `A win pays 1 to 1. A blackjack pays ${r.blackjackPays === 1.5 ? '3 to 2' : '6 to 5'}${r.blackjackPays === 1.2 ? ', which costs you about 1.4% of every bet compared with 3 to 2' : ''}. Insurance pays 2 to 1.`,
    ],
  },
];

export interface LessonQuestion {
  lesson: LessonId;
  prompt: string;
  player: Card[];
  dealer?: Card[];
  options: string[];
  answer: string;
  /** Why, computed for these exact cards. */
  explain: string;
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}
function card(rng: Rng, rank?: Rank): Card {
  return { rank: rank ?? pick(RANKS, rng), suit: pick(SUITS, rng) };
}
function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function totalLabel(cards: Card[]): string {
  const v = handValue(cards);
  if (isBlackjack(cards)) return 'Blackjack';
  if (v.total > 21) return 'Bust';
  return `${v.soft ? 'Soft' : 'Hard'} ${v.total}`;
}

const ACTION_MEANING: Record<string, string> = {
  Hit: 'Take another card',
  Stand: 'Take no more cards',
  Double: 'Double the bet and take exactly one more card',
  Split: 'Make two hands from a pair, each with its own bet',
  Surrender: 'Give up the hand and get half the bet back',
};

export function makeLessonQuestion(lesson: LessonId, rules: Rules, rng: Rng = Math.random): LessonQuestion {
  if (lesson === 'values') {
    const n = 2 + Math.floor(rng() * 2);
    const player = Array.from({ length: n }, () => card(rng));
    const v = handValue(player);
    const right = v.total > 21 ? 'Bust' : String(v.total);
    // Three wrong answers from every possible answer, nearest totals first (with a little shuffle).
    const all = [...Array.from({ length: 18 }, (_, i) => String(i + 4)), 'Bust'].filter((x) => x !== right);
    const dist = (x: string) => Math.abs((x === 'Bust' ? 22 : Number(x)) - Math.min(v.total, 22)) + rng() * 2;
    const pool = [right, ...all.sort((x, y) => dist(x) - dist(y)).slice(0, 3)];
    const aces = player.filter((c) => c.rank === 'A').length;
    return {
      lesson, prompt: 'What is this hand worth?', player, options: shuffle(pool, rng), answer: right,
      explain: `${player.map((c) => c.rank).join(' + ')}: ${aces ? `${aces === 1 ? 'the Ace counts' : 'one Ace can count'} ${v.soft ? 11 : 1}${aces > 1 && v.soft ? ' and the rest 1' : ''}, so ` : ''}${v.total > 21 ? `${v.total}, over 21: bust` : `the hand is ${v.total}`}.`,
    };
  }
  if (lesson === 'soft') {
    // Mix soft, hard and blackjack hands.
    const kind = rng();
    let player: Card[];
    if (kind < 0.4) player = [card(rng, 'A'), card(rng, pick(['2', '3', '4', '5', '6', '7', '8', '9'] as Rank[], rng))];
    else if (kind < 0.6) player = [card(rng, 'A'), card(rng, pick(['5', '6', '7', '8', '9', '10', 'K'] as Rank[], rng)), card(rng, pick(['6', '7', '8', '9', '10'] as Rank[], rng))];
    else if (kind < 0.7) player = [card(rng, 'A'), card(rng, pick(['10', 'J', 'Q', 'K'] as Rank[], rng))];
    else player = [card(rng, pick(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J'] as Rank[], rng)), card(rng, pick(['2', '3', '4', '5', '6', '7', '8', '9'] as Rank[], rng))];
    const right = totalLabel(player);
    const v = handValue(player);
    const options = new Set<string>([right]);
    if (right !== 'Bust' && right !== 'Blackjack') {
      options.add(`${v.soft ? 'Hard' : 'Soft'} ${v.total}`);
      if (player.some((c) => c.rank === 'A')) options.add(`${v.soft ? 'Hard' : 'Soft'} ${v.soft ? v.total - 10 : v.total + 10 > 21 ? v.total + 1 : v.total + 10}`);
    }
    if (player.length === 2 && player.some((c) => c.rank === 'A')) options.add('Blackjack');
    for (let extra = 1; options.size < 3 && extra < 30; extra++) options.add(`Hard ${Math.min(21, v.total) - extra}`);
    const hasAce = player.some((c) => c.rank === 'A');
    return {
      lesson, prompt: 'Soft, hard or blackjack?', player, options: shuffle([...options].slice(0, 4), rng), answer: right,
      explain: right === 'Blackjack'
        ? 'An Ace and a ten-value card as the first two cards: blackjack.'
        : v.soft ? `The Ace counts 11 without busting, so it’s soft ${v.total}.`
          : hasAce ? `Counting the Ace as 11 would go over 21, so it counts 1: hard ${v.total}.` : `No Ace: hard ${v.total}.`,
    };
  }
  if (lesson === 'actions') {
    const names = rules.surrender === 'late' ? Object.keys(ACTION_MEANING) : Object.keys(ACTION_MEANING).filter((n) => n !== 'Surrender');
    const name = pick(names, rng);
    const wrong = shuffle(names.filter((n) => n !== name), rng).slice(0, 2).map((n) => ACTION_MEANING[n]);
    return {
      lesson, prompt: `What does “${name}” do?`, player: [], options: shuffle([ACTION_MEANING[name], ...wrong], rng),
      answer: ACTION_MEANING[name], explain: `${name}: ${ACTION_MEANING[name].toLowerCase()}.`,
    };
  }
  // Outcomes: a finished hand against a dealer hand played out by the rules.
  let player: Card[];
  do player = [card(rng), card(rng)]; while (handValue(player).total < 12 && !isBlackjack(player));
  if (!isBlackjack(player) && handValue(player).total < 17 && rng() < 0.5) player.push(card(rng));
  const deck = Array.from({ length: 12 }, () => card(rng));
  const dealer = playDealer([card(rng), card(rng)], () => deck.shift()!, rules);
  const s = settleHand(player, dealer, 10, rules);
  const right = s.net > 0 ? `Win ${s.net}` : s.net < 0 ? 'Lose 10' : 'Push';
  const options = shuffle([...new Set([right, 'Win 10', 'Lose 10', 'Push', `Win ${10 * rules.blackjackPays}`])], rng).slice(0, 4);
  if (!options.includes(right)) options[0] = right;
  const p = handValue(player);
  const d = handValue(dealer);
  const why = s.result === 'blackjack' ? `Blackjack pays ${rules.blackjackPays === 1.5 ? '3 to 2' : '6 to 5'}: ${s.net} on a bet of 10.`
    : s.result === 'bust' ? `You went over 21 (${p.total}), so you lose whatever the dealer has.`
      : d.total > 21 ? `The dealer busted with ${d.total}.`
        : s.result === 'push' ? `Both have ${p.total}: a push.`
          : isBlackjack(dealer) ? 'The dealer has blackjack.'
            : `${p.total} against the dealer’s ${d.total}.`;
  return {
    lesson, prompt: 'You bet 10. What happens?', player, dealer, options: shuffle(options, rng), answer: right, explain: why,
  };
}
