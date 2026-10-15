import { type Action, doubleTotalAllowed } from '../actions';
import type { Pip } from '../cards';
import { type Rules, strategyKey } from '../rules';
import { type HandClass, classKey, compositions, hardClass } from './classes';
import { type Composition, fullShoe, removeCards } from './composition';
import { BUST, dealerModel } from './dealerModel';
import { PlayerEv, effectiveTotal } from './playerEv';

export interface OptionEval {
  action: Action;
  /**
   * Expected value per unit of the original bet. With a dealer peek this is the EV after the dealer has
   * checked for blackjack. Without a peek it includes losing every bet on the table to a dealer blackjack.
   */
  ev: number;
}

export interface Evaluation {
  /** Allowed options, best first. */
  options: OptionEval[];
  /** Chance the dealer busts, given no dealer blackjack. */
  dealerBust: number;
  /** Chance that one more card busts the player. */
  hitBust: number;
}

/** EV given no dealer blackjack, and the expected amount on the table that a dealer blackjack would take. */
interface Raw {
  cond: number;
  risk: number;
}

function scorer(rules: Rules, pBlackjack: number): (r: Raw) => number {
  if (rules.dealerPeeks) return (r) => r.cond;
  return (r) => (1 - pBlackjack) * r.cond - pBlackjack * r.risk;
}

function bestRaw(options: Raw[], score: (r: Raw) => number): Raw {
  let best = options[0];
  for (const o of options) if (score(o) > score(best)) best = o;
  return best;
}

function addRaw(a: Raw, b: Raw, wa = 1, wb = 1): Raw {
  return { cond: wa * a.cond + wb * b.cond, risk: wa * a.risk + wb * b.risk };
}

/**
 * EV of splitting a pair of `pip`. Each split hand draws its second card from the same shoe. When that card
 * pairs again and another hand is allowed, the better of resplitting and playing on is taken. Split aces get
 * one card each. A two-card 21 after a split is not a blackjack.
 */
function splitRaw(
  pip: Pip,
  q: readonly number[],
  calc: PlayerEv,
  rules: Rules,
  score: (r: Raw) => number,
  handsBefore: number,
): Raw {
  const handValue = (x: number): Raw => {
    const sum = pip + x;
    const hasAce = pip === 1 || x === 1;
    if (pip === 1) return { cond: calc.stand(sum, true), risk: 1 };
    const opts: Raw[] = [
      { cond: calc.stand(sum, hasAce), risk: 1 },
      { cond: calc.hit(sum, hasAce), risk: 1 },
    ];
    if (rules.doubleAfterSplit && doubleTotalAllowed(effectiveTotal(sum, hasAce), rules)) {
      opts.push({ cond: calc.double(sum, hasAce), risk: 2 });
    }
    return bestRaw(opts, score);
  };

  const pPair = q[pip];
  let nonPair: Raw = { cond: 0, risk: 0 };
  for (let x = 1; x <= 10; x++) {
    if (x === pip || q[x] === 0) continue;
    nonPair = addRaw(nonPair, handValue(x), 1, q[x] / (1 - pPair));
  }
  const pairedAgain = handValue(pip);
  const canResplit = pip !== 1 || rules.resplitAces;

  const memo = new Map<string, Raw>();
  // f(open, hands): value of `open` split hands still waiting for their second card, `hands` hands in total.
  const f = (open: number, hands: number): Raw => {
    if (open === 0) return { cond: 0, risk: 0 };
    const key = `${open}|${hands}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const rest = f(open - 1, hands);
    const playOn = addRaw(pairedAgain, rest);
    let pairBranch = playOn;
    if (canResplit && hands < rules.maxSplitHands) {
      const resplit = f(open + 1, hands + 1);
      if (score(resplit) > score(playOn)) pairBranch = resplit;
    }
    const out = addRaw(addRaw(nonPair, rest), pairBranch, 1 - pPair, pPair);
    memo.set(key, out);
    return out;
  };
  return f(2, handsBefore + 1);
}

export interface EvaluateOptions {
  double: boolean;
  surrender: boolean;
  split: boolean;
  /** Hands the player holds before this decision (for split limits). */
  hands?: number;
  /** A split ace: stand only (resplitting is decided by `split`). */
  splitAces?: boolean;
}

/**
 * Evaluates one exact hand (any number of cards) against an upcard. `shoe` is the shoe before the player's
 * cards and the upcard are dealt; it defaults to a fresh shoe for the table's deck count.
 */
export function evaluatePips(
  pips: readonly Pip[],
  upcard: Pip,
  rules: Rules,
  allow: EvaluateOptions,
  shoe: Composition = fullShoe(rules.decks),
): Evaluation {
  const comp: Composition = removeCards(shoe, [...pips, upcard]);
  const model = dealerModel(upcard, comp, rules.hitSoft17);
  const calc = new PlayerEv(model.playerDraw, model.final);
  const score = scorer(rules, model.pBlackjack);
  let sum = 0;
  let hasAce = false;
  for (const p of pips) {
    sum += p;
    if (p === 1) hasAce = true;
  }
  const raws: [Action, Raw][] = [['stand', { cond: calc.stand(sum, hasAce), risk: 1 }]];
  if (!allow.splitAces) {
    raws.push(['hit', { cond: calc.hit(sum, hasAce), risk: 1 }]);
    if (allow.double) raws.push(['double', { cond: calc.double(sum, hasAce), risk: 2 }]);
  }
  if (allow.surrender) raws.push(['surrender', { cond: -0.5, risk: 1 }]);
  if (allow.split && pips.length === 2 && pips[0] === pips[1]) {
    raws.push(['split', splitRaw(pips[0], model.playerDraw, calc, rules, score, allow.hands ?? 1)]);
  }
  const options = raws.map(([action, r]) => ({ action, ev: score(r) })).sort((a, b) => b.ev - a.ev);
  return { options, dealerBust: model.final[BUST], hitBust: calc.bustOnHit(sum) };
}

const classCache = new Map<string, Evaluation>();

/**
 * Total-dependent evaluation of a two-card hand class: the EV of each option is averaged over the card
 * combinations that make the class, weighted by how likely each is to be dealt.
 *
 * A pair that is not split is played exactly like the hard total it makes, so for pairs 3,3 to 9,9 the
 * non-split options are taken from that hard-total class. That way the pairs chart, the hard chart and the
 * drill can never disagree. 2,2, 10,10 and A,A have no hard-total row, so they use their own cards.
 */
export function evaluateClass(cls: HandClass, upcard: Pip, rules: Rules): Evaluation {
  const key = `${strategyKey(rules)}|${classKey(cls)}|${upcard}`;
  const cached = classCache.get(key);
  if (cached) return cached;
  const result = evaluateClassOn(cls, upcard, rules, fullShoe(rules.decks));
  classCache.set(key, result);
  return result;
}

/** The same total-dependent evaluation for any shoe composition, for example a shoe at a given true count. Not cached. */
export function evaluateClassOn(cls: HandClass, upcard: Pip, rules: Rules, shoe: Composition): Evaluation {
  const allow: EvaluateOptions = {
    double: doubleTotalAllowed(cls.total, rules),
    surrender: rules.surrender === 'late',
    split: cls.kind === 'pair' && rules.maxSplitHands >= 2,
  };
  let result: Evaluation;

  if (cls.kind === 'pair') {
    const pip = cls.pip!;
    const own = evaluatePips([pip, pip], upcard, rules, allow, shoe);
    if (pip >= 3 && pip <= 9) {
      const hard = evaluateClassOn(hardClass(pip * 2), upcard, rules, shoe);
      const split = own.options.filter((o) => o.action === 'split');
      result = {
        options: [...hard.options, ...split].sort((a, b) => b.ev - a.ev),
        dealerBust: hard.dealerBust,
        hitBust: hard.hitBust,
      };
    } else {
      result = own;
    }
  } else {
    const base = removeCards(shoe, [upcard]);
    const combos = compositions(cls);
    const sums = new Map<Action, number>();
    let dealerBust = 0;
    let hitBust = 0;
    let totalWeight = 0;
    for (const [a, b] of combos) {
      const w = base[a] * (base[b] - (a === b ? 1 : 0));
      if (w <= 0) continue;
      const e = evaluatePips([a, b], upcard, rules, allow, shoe);
      for (const o of e.options) sums.set(o.action, (sums.get(o.action) ?? 0) + w * o.ev);
      dealerBust += w * e.dealerBust;
      hitBust += w * e.hitBust;
      totalWeight += w;
    }
    result = {
      options: [...sums].map(([action, s]) => ({ action, ev: s / totalWeight })).sort((a, b) => b.ev - a.ev),
      dealerBust: dealerBust / totalWeight,
      hitBust: hitBust / totalWeight,
    };
  }
  return result;
}

/** EV of taking insurance (per unit of insurance bet), with the player's cards and the Ace removed from `shoe`. */
export function insuranceEv(
  playerPips: readonly Pip[],
  rules: Rules,
  shoe: Composition = fullShoe(rules.decks),
): number {
  const comp = removeCards(shoe, [...playerPips, 1]);
  let n = 0;
  for (let p = 1; p <= 10; p++) n += comp[p];
  const pTen = comp[10] / n;
  return 2 * pTen - (1 - pTen);
}
