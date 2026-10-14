import type { Action } from '../actions';
import { pipName, pipWithArticle } from '../cards';
import { pairTotalPhrase } from './classes';
import type { OptionEval } from './evaluate';
import type { Advice } from './oracle';

/**
 * Plain-language reasons. Every sentence is built from the engine's numbers for this exact situation,
 * so the text can't contradict the computed answer.
 */

const VERB: Record<Action, string> = {
  hit: 'hitting',
  stand: 'standing',
  double: 'doubling',
  split: 'splitting',
  surrender: 'surrendering',
};

/** EV per unit as a whole number per 100 bet: "+12", "−21", "0". */
export function per100(ev: number): string {
  const n = Math.round(ev * 100);
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${-n}`;
  return '0';
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The total the hand is played as, in prose: "hard 13", "soft 18". */
function totalPhrase(a: Advice): string {
  if (a.hand.kind === 'pair') return pairTotalPhrase(a.hand.pip!);
  return `${a.hand.kind} ${a.hand.total}`;
}

function isHardLike(a: Advice): boolean {
  return a.hand.kind === 'hard' || (a.hand.kind === 'pair' && a.hand.pip !== 1);
}

function comparison(a: Advice): OptionEval | undefined {
  if (a.hand.kind === 'pair' && a.best !== 'split') {
    const split = a.options.find((o) => o.action === 'split');
    if (split) return split;
  }
  return a.options[1];
}

function mainClause(a: Advice): string {
  const up = pipName(a.upcard);
  const upA = pipWithArticle(a.upcard);
  const total = totalPhrase(a);
  const t = a.hand.total;
  const bust = pct(a.dealerBust);
  const others = a.options.filter((o) => o.action !== a.best);
  switch (a.best) {
    case 'surrender':
      return `Every way of playing ${total} against ${upA} loses more than 50 per 100 bet on average.`;
    case 'split':
      return a.dealerBust >= 0.35
        ? `A dealer ${up} busts ${bust} of the time, so two hands against it earn more than one.`
        : `Two hands that each start with ${pipWithArticle(a.hand.pip!)} do better against ${upA} than one ${total}.`;
    case 'double': {
      const ahead = others.some((o) => o.action !== 'split' && o.action !== 'surrender' && o.ev > 0);
      if (ahead) return `You are already ahead with ${total} against ${upA}, so doubling puts more money on a good spot.`;
      return `Against ${upA}, doubling ${total} wins more than it risks.`;
    }
    case 'stand':
      if (isHardLike(a) && t >= 12 && t <= 16) {
        return `Hitting ${total} busts ${pct(a.hitBust)} of the time, and a dealer ${up} busts ${bust} of the time on its own.`;
      }
      if (isHardLike(a)) return `Hitting ${total} busts ${pct(a.hitBust)} of the time.`;
      return `${capital(total)} is strong enough to stand on against ${upA}.`;
    case 'hit':
      if (isHardLike(a) && t <= 11) return `${capital(total)} can’t bust with one more card.`;
      if (isHardLike(a)) {
        return `Standing on ${total} only wins when the dealer busts, and a dealer ${up} busts only ${bust} of the time.`;
      }
      return `A ${total} can’t bust with one more card, and it’s too weak to stand on against ${upA}.`;
  }
}

/** One or two sentences explaining the best play. */
export function explain(a: Advice): string {
  const best = a.options[0];
  const alt = comparison(a);
  const numbers = alt
    ? `${capital(VERB[best.action])} averages ${per100(best.ev)} per 100 bet; ${VERB[alt.action]} averages ${per100(alt.ev)}.`
    : '';
  return `${mainClause(a)} ${numbers}`.trim();
}

export interface MistakeCost {
  /** EV lost per 100 bet. */
  lossPer100: number;
  label: string;
}

export function mistakeCost(a: Advice, chosen: Action): MistakeCost {
  const best = a.options[0].ev;
  const mine = a.options.find((o) => o.action === chosen)?.ev ?? best;
  const loss = Math.max(0, (best - mine) * 100);
  const lossPer100 = Math.round(loss * 10) / 10;
  const label = loss < 2 ? 'Close call' : loss < 8 ? 'Costly mistake' : 'Big mistake';
  return { lossPer100, label: `${label}: costs ${lossPer100} per 100 bet` };
}

export function actionVerb(action: Action): string {
  return VERB[action];
}
