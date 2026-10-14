import {
  type DeckCount, type DoubleOn, type Rules, DRILL_FILTER_LABEL, RULE_PRESETS, SIX_TO_FIVE_WARNING, rulesSummary,
  strategyKey, COUNT_VARIANTS, TRUE_COUNT_SOURCES,
} from '../../engine';
import { type Screen, app } from '../app';
import { navRow } from '../components';
import { countScreen } from './count';
import { strategyScreen } from './strategy';
import { trueCountScreen } from './trueCount';

function select<T extends string | number>(id: string, label: string, value: T, options: [T, string][]): string {
  const opts = options.map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${l}</option>`).join('');
  return `<label class="rule-row" for="${id}"><span>${label}</span><select id="${id}" data-rule="${id}">${opts}</select></label>`;
}

function applyRule(id: string, value: string): void {
  const r: Rules = { ...app.prefs.rules };
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
  app.setPrefs({ rules: r });
  app.render();
}

/** Home: pick a drill, set the table rules. */
export function hubScreen(): Screen {
  return {
    render() {
      const r = app.prefs.rules;
      const key = strategyKey(r);
      const presets = RULE_PRESETS.map((p) => {
        const on = strategyKey(p.rules) === key && p.rules.blackjackPays === r.blackjackPays;
        return `<button class="pill${on ? ' on' : ''}" data-act="preset" data-value="${p.id}" aria-pressed="${on}">${p.name}</button>`;
      }).join('');
      const variant = COUNT_VARIANTS.find((v) => v.id === app.prefs.countVariant)!;
      const source = TRUE_COUNT_SOURCES.find((s) => s.id === app.prefs.tcSource)!;
      const pens = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85].map((p): [number, string] => [p, `${Math.round(p * 100)}%`]);

      return `<main class="screen">
        <header class="home-top">
          <h1 class="title">Drill</h1>
          <div class="home-top-right"><span class="small muted">${rulesSummary(r)}</span>${app.chartButton()}</div>
        </header>

        <section class="block">
          <h2 class="section-label">Drills</h2>
          <div class="stack">
            ${navRow('open', 'strategy', 'Strategy drill', DRILL_FILTER_LABEL[app.prefs.filter])}
            ${navRow('open', 'count', 'Hi-Lo count drill', `${variant.name} · ${app.prefs.countMode === 'learn' && variant.learnable ? 'learning' : 'test'}`)}
            ${navRow('open', 'true', 'True count drill', source.name)}
          </div>
        </section>

        <section class="block">
          <h2 class="section-label">Table rules</h2>
          <div class="pills">${presets}</div>
          <div class="rules">
            ${select('decks', 'Decks', r.decks, [[1, '1'], [2, '2'], [4, '4'], [6, '6'], [8, '8']])}
            ${select('hitSoft17', 'Dealer on soft 17', r.hitSoft17 ? 'H17' : 'S17', [['H17', 'Hits (H17)'], ['S17', 'Stands (S17)']])}
            ${select('blackjackPays', 'Blackjack pays', r.blackjackPays === 1.5 ? '3:2' : '6:5', [['3:2', '3:2'], ['6:5', '6:5']])}
            ${r.blackjackPays === 1.2 ? `<p class="warn small">${SIX_TO_FIVE_WARNING}</p>` : ''}
            ${select('doubleOn', 'Double on', r.doubleOn, [['any', 'Any two cards'], ['9-11', '9 to 11 only'], ['10-11', '10 or 11 only']])}
            ${select('doubleAfterSplit', 'Double after split', r.doubleAfterSplit ? 'yes' : 'no', [['yes', 'Allowed'], ['no', 'Not allowed']])}
            ${select('resplitAces', 'Resplit aces', r.resplitAces ? 'yes' : 'no', [['no', 'Not allowed'], ['yes', 'Allowed']])}
            ${select('maxSplitHands', 'Max split hands', r.maxSplitHands, [[2, '2'], [3, '3'], [4, '4']])}
            ${select('surrender', 'Surrender', r.surrender, [['late', 'Late surrender'], ['none', 'Not allowed']])}
            ${select('dealerPeeks', 'Dealer peeks for blackjack', r.dealerPeeks ? 'yes' : 'no', [['yes', 'Yes (US style)'], ['no', 'No (European, no hole card)']])}
            ${select('penetration', 'Penetration', r.penetration, pens)}
          </div>
          <p class="small muted">Strategy, the chart and the shoes in every drill follow these rules. Check the posted rules at your table.</p>
        </section>
      </main>`;
    },

    click(act, el) {
      const v = el.dataset.value!;
      if (act === 'open') {
        app.go(v === 'strategy' ? strategyScreen() : v === 'count' ? countScreen() : trueCountScreen());
      } else if (act === 'preset') {
        const p = RULE_PRESETS.find((x) => x.id === v);
        if (p) { app.setPrefs({ rules: { ...p.rules, penetration: app.prefs.rules.penetration } }); app.render(); }
      }
    },

    change(el) {
      if (el.dataset.rule) applyRule(el.dataset.rule, el.value);
    },
  };
}
