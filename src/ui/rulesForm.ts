import { type DeckCount, type DoubleOn, type Rules, SIX_TO_FIVE_WARNING } from '../engine';

/** One labelled select. `prefix` keeps ids unique when two forms share a page. */
export function ruleSelect<T extends string | number>(prefix: string, id: string, label: string, value: T, options: [T, string][], extra = ''): string {
  const opts = options.map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${l}</option>`).join('');
  return `<label class="rule-row" for="${prefix}${id}"><span>${label}</span><span class="rule-control">${extra}<select id="${prefix}${id}" data-rule="${id}" data-form="${prefix}">${opts}</select></span></label>`;
}

export const PENETRATIONS: [number, string][] = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85].map((p) => [p, `${Math.round(p * 100)}%`]);

/** Every table rule as a select. `extra(id)` can add something before each control (a checkbox, for example). */
export function rulesFormHtml(r: Rules, prefix = '', extra: (id: string) => string = () => ''): string {
  const s = <T extends string | number>(id: string, label: string, value: T, options: [T, string][]) => ruleSelect(prefix, id, label, value, options, extra(id));
  return `<div class="rules">
    ${s('decks', 'Decks', r.decks, [[1, '1'], [2, '2'], [4, '4'], [6, '6'], [8, '8']])}
    ${s('hitSoft17', 'Dealer on soft 17', r.hitSoft17 ? 'H17' : 'S17', [['H17', 'Hits (H17)'], ['S17', 'Stands (S17)']])}
    ${s('blackjackPays', 'Blackjack pays', r.blackjackPays === 1.5 ? '3:2' : '6:5', [['3:2', '3:2'], ['6:5', '6:5']])}
    ${r.blackjackPays === 1.2 ? `<p class="warn small">${SIX_TO_FIVE_WARNING}</p>` : ''}
    ${s('dealerPeeks', 'Hole card', r.dealerPeeks ? 'yes' : 'no', [['yes', 'Dealer peeks (US style)'], ['no', 'No hole card (European)']])}
    ${s('doubleOn', 'Double on', r.doubleOn, [['any', 'Any two cards'], ['9-11', '9 to 11 only'], ['10-11', '10 or 11 only']])}
    ${s('doubleAfterSplit', 'Double after split', r.doubleAfterSplit ? 'yes' : 'no', [['yes', 'Allowed'], ['no', 'Not allowed']])}
    ${s('resplitAces', 'Resplit aces', r.resplitAces ? 'yes' : 'no', [['no', 'Not allowed'], ['yes', 'Allowed']])}
    ${s('maxSplitHands', 'Max split hands', r.maxSplitHands, [[2, '2'], [3, '3'], [4, '4']])}
    ${s('surrender', 'Surrender', r.surrender, [['late', 'Late surrender'], ['none', 'Not allowed']])}
    ${s('penetration', 'Penetration', r.penetration, PENETRATIONS)}
  </div>`;
}

/** Returns the rules with one field changed from a select's value. */
export function withRule(rules: Rules, id: string, value: string): Rules {
  const r: Rules = { ...rules };
  switch (id) {
    case 'decks': r.decks = Number(value) as DeckCount; break;
    case 'hitSoft17': r.hitSoft17 = value === 'H17'; break;
    case 'blackjackPays': r.blackjackPays = value === '3:2' ? 1.5 : 1.2; break;
    case 'doubleOn': r.doubleOn = value as DoubleOn; break;
    case 'doubleAfterSplit': r.doubleAfterSplit = value === 'yes'; break;
    case 'resplitAces': r.resplitAces = value === 'yes'; break;
    case 'maxSplitHands': r.maxSplitHands = Number(value); break;
    case 'surrender': r.surrender = value === 'late' ? 'late' : 'none'; break;
    case 'dealerPeeks': r.dealerPeeks = value === 'yes'; break;
    case 'penetration': r.penetration = Number(value); break;
  }
  return r;
}
