import {
  type TrueCountRounding, INSURANCE_DEVIATION, ROUNDING_DESCRIPTION, ROUNDING_LABEL, RULE_PRESETS, TRUE_COUNT_ROUNDINGS,
  describeSpread, indexMismatch, rulesSummary, strategyKey,
} from '../../engine';
import { type Screen, app } from '../app';
import { navRow, optionRow, pills, tabBar } from '../components';
import { icon } from '../icons';
import { rulesFormHtml, withRule } from '../rulesForm';
import type { TextSize } from '../storage';
import { bettingScreen } from './betting';
import { casinoScreen } from './casino';
import { onboardingScreen } from './onboarding';
import { statsScreen } from './stats';

export function settingsScreen(): Screen {
  return {
    render() {
      const p = app.prefs;
      const r = p.rules;
      const key = strategyKey(r);
      const same = (x: typeof r) => strategyKey(x) === key && x.blackjackPays === r.blackjackPays;
      const presets = [
        ...RULE_PRESETS.map((x) => ({ value: x.id, label: x.name, on: same(x.rules) })),
        { value: 'mycasino', label: `${p.myCasino.name}${p.myCasino.verified ? '' : ' (unverified)'}`, on: same(p.myCasino.rules) },
      ];
      const mismatch = indexMismatch(INSURANCE_DEVIATION.source, p.tcRounding, r);
      const d = p.display;
      const sizes: [TextSize, string][] = [['normal', 'Normal'], ['large', 'Large'], ['larger', 'Larger']];
      return `<main class="screen with-tabs">
        <header class="home-top"><h1 class="title">Settings</h1><div class="home-top-right"><span class="small muted">${rulesSummary(r)}</span>${app.chartButton()}</div></header>

        <section class="block">
          <h2 class="section-label">Table rules</h2>
          ${pills('preset', presets, 'Rule presets')}
          ${rulesFormHtml(r)}
          <p class="small muted">Strategy, the chart, the count indices and every drill follow these rules. Table rules vary by casino; check the posted rules at the table you play.</p>
        </section>

        <section class="block">
          <h2 class="section-label">My casino</h2>
          <div class="stack">${navRow('open', 'casino', `${p.myCasino.name} checklist`, p.myCasino.verified ? 'Checked at the table' : 'Unverified: check these rules on your next visit')}</div>
        </section>

        <section class="block">
          <h2 class="section-label">True count</h2>
          ${pills('rounding', TRUE_COUNT_ROUNDINGS.map((k) => ({ value: k, label: ROUNDING_LABEL[k], on: k === p.tcRounding })), 'Rounding')}
          <p class="small muted">${ROUNDING_DESCRIPTION[p.tcRounding]} Decks left are rounded to the nearest half deck first.</p>
          ${mismatch ? `<p class="index-warning small" role="note">${icon.alert()} <span>${mismatch}</span></p>` : ''}
        </section>

        <section class="block">
          <h2 class="section-label">Betting</h2>
          <div class="stack">${navRow('open', 'betting', 'Bet spread and bankroll', `${describeSpread(p.spread)} 1 unit = ${p.unitPotatoes} potatoes.`)}</div>
        </section>

        <section class="block">
          <h2 class="section-label">Display and feedback</h2>
          <div class="stack">
            ${optionRow('toggle', 'reduceMotion', 'Reduce motion', 'Turn off card and flash animations', d.reduceMotion)}
            ${optionRow('toggle', 'highContrast', 'High contrast', 'Brighter muted text and borders', d.highContrast)}
            ${optionRow('toggle', 'sound', 'Sound', 'A short tone for right and wrong answers', d.sound)}
            ${optionRow('toggle', 'haptics', 'Vibration', 'A short buzz on phones that support it', d.haptics)}
          </div>
          <h3 class="section-label">Text size</h3>
          ${pills('textsize', sizes.map(([v, l]) => ({ value: v, label: l, on: d.textSize === v })), 'Text size')}
        </section>

        <section class="block">
          <h2 class="section-label">You</h2>
          <div class="stack">
            ${navRow('open', 'onboarding', 'Redo the setup questions', 'Changes your starting stage and path, keeps your progress')}
            ${navRow('open', 'data', 'Export or import your progress', 'On the Stats tab')}
          </div>
        </section>

        <p class="small muted">Potatoes are practice currency only. Basic strategy lowers the house edge but doesn’t beat it; counting gives a small edge with large swings, and casinos can refuse service to counters. Online random-number games and continuous shufflers can’t be counted.</p>
        ${tabBar('settings')}
      </main>`;
    },
    click(act, el) {
      const v = el.dataset.value ?? '';
      const p = app.prefs;
      if (act === 'preset') {
        const rules = v === 'mycasino' ? p.myCasino.rules : RULE_PRESETS.find((x) => x.id === v)!.rules;
        app.setPrefs({ rules: { ...rules, penetration: v === 'mycasino' ? rules.penetration : p.rules.penetration } });
        app.render();
      } else if (act === 'rounding') { app.setPrefs({ tcRounding: v as TrueCountRounding }); app.render(); }
      else if (act === 'toggle') { app.setPrefs({ display: { ...p.display, [v]: !p.display[v as 'sound'] } }); app.applyDisplay(); app.render(); }
      else if (act === 'textsize') { app.setPrefs({ display: { ...p.display, textSize: v as TextSize } }); app.applyDisplay(); app.render(); }
      else if (act === 'open') {
        if (v === 'casino') app.go(casinoScreen());
        else if (v === 'betting') app.go(bettingScreen());
        else if (v === 'onboarding') app.go(onboardingScreen());
        else if (v === 'data') app.go(statsScreen());
      }
    },
    change(el) {
      if (el.dataset.rule && el.dataset.form === '') { app.setPrefs({ rules: withRule(app.prefs.rules, el.dataset.rule, el.value) }); app.render(); }
    },
  };
}
