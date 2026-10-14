import { type Action, ACTION_LABEL } from '../actions';
import { type Card, type Pip, type Rank, SUITS, pipName, pipWithArticle } from '../cards';
import type { Rules } from '../rules';
import type { Rng } from '../shoe';
import {
  type HandClass, HARD_TOTALS, PAIR_PIPS, SOFT_TOTALS, UPCARDS, classKey, classLabel, compositions,
  hardClass, pairClass, softClass,
} from './classes';
import { type Advice, adviseClass } from './oracle';

export type DrillFilter = 'all' | 'hard' | 'soft' | 'pairs';

export const DRILL_FILTER_LABEL: Record<DrillFilter, string> = {
  all: 'All hands',
  hard: 'Hard totals',
  soft: 'Soft totals',
  pairs: 'Pairs',
};

export interface DrillHand {
  player: Card[];
  upcard: Card;
  /** Never shown during the decision. With a peek it never completes a dealer blackjack. */
  hole: Card;
}

export function drillClasses(filter: DrillFilter): HandClass[] {
  const hard = HARD_TOTALS.map(hardClass);
  const soft = SOFT_TOTALS.map(softClass);
  const pairs = PAIR_PIPS.map(pairClass);
  if (filter === 'hard') return hard;
  if (filter === 'soft') return soft;
  if (filter === 'pairs') return pairs;
  return [...hard, ...soft, ...pairs];
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

const TENS: readonly Rank[] = ['10', 'J', 'Q', 'K'];

function cardFor(pip: Pip, rng: Rng): Card {
  const rank: Rank = pip === 1 ? 'A' : pip === 10 ? pick(TENS, rng) : (String(pip) as Rank);
  return { rank, suit: pick(SUITS, rng) };
}

/** Deals a random drill hand: a uniformly random chart cell, then a random card combination for it. */
export function dealDrillHand(filter: DrillFilter, rules: Rules, rng: Rng = Math.random): DrillHand {
  const cls = pick(drillClasses(filter), rng);
  const [a, b] = pick(compositions(cls), rng);
  const up = pick(UPCARDS, rng);
  const player = rng() < 0.5 ? [cardFor(a, rng), cardFor(b, rng)] : [cardFor(b, rng), cardFor(a, rng)];
  let holePip = (Math.floor(rng() * 10) + 1) as Pip;
  if (rules.dealerPeeks) {
    while ((up === 1 && holePip === 10) || (up === 10 && holePip === 1)) holePip = (Math.floor(rng() * 10) + 1) as Pip;
  }
  return { player, upcard: cardFor(up, rng), hole: cardFor(holePip, rng) };
}

export interface FollowUp {
  question: string;
  upcard: Pip;
  options: Action[];
  answer: Action;
}

/** "Same hand, dealer shows a 6: what now?" Prefers an upcard where the answer changes. */
export function followUp(a: Advice, rules: Rules, rng: Rng = Math.random): FollowUp | null {
  const others = UPCARDS.filter((u) => u !== a.upcard).map((u) => adviseClass(a.hand, u, rules));
  if (others.length === 0) return null;
  const different = others.filter((o) => o.best !== a.best);
  const target = pick(different.length > 0 ? different : others, rng);
  const allowed = target.options.map((o) => o.action);
  const set = new Set<Action>([target.best]);
  if (allowed.includes(a.best)) set.add(a.best);
  for (const act of allowed) if (set.size < 3) set.add(act);
  const options = [...set].sort(() => rng() - 0.5);
  return {
    question: `Same hand, dealer shows ${pipWithArticle(target.upcard)}: what now?`,
    upcard: target.upcard,
    options,
    answer: target.best,
  };
}

/** One line with two more hands that follow the same rule, nearest cells first. */
export function samePattern(a: Advice, rules: Rules): string | null {
  const rows = drillClasses(a.hand.kind === 'pair' ? 'pairs' : a.hand.kind);
  const key = classKey(a.hand);
  const rowIndex = rows.findIndex((c) => classKey(c) === key);
  const col = UPCARDS.indexOf(a.upcard);
  const candidates: { cls: HandClass; up: Pip; dist: number }[] = [];
  rows.forEach((cls, r) => {
    UPCARDS.forEach((up, c) => {
      if (r === rowIndex && c === col) return;
      // Same row first, then same upcard, then everything else.
      const dist = r === rowIndex ? Math.abs(c - col) : c === col ? 10 + Math.abs(r - rowIndex) : 100 + Math.abs(r - rowIndex) + Math.abs(c - col);
      candidates.push({ cls, up, dist });
    });
  });
  candidates.sort((x, y) => x.dist - y.dist);
  const matches = candidates.filter((c) => adviseClass(c.cls, c.up, rules).best === a.best).slice(0, 2);
  if (matches.length === 0) return null;
  const names = matches.map((m) => `${classLabel(m.cls).toLowerCase()} vs ${pipName(m.up)}`);
  const list = names.length === 2 ? `${names[0]} and ${names[1]}` : names[0];
  return `${list.charAt(0).toUpperCase()}${list.slice(1)}: also ${ACTION_LABEL[a.best].toLowerCase()}.`;
}
