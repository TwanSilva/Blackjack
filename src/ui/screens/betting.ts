import {
  type BetSpread, type CountBin, type SpreadOutlook, DEFAULT_SPREAD, describeSpread, offTheTopReturn, signed,
  spreadOutlook, strategyKey, trueCountFrequencies, validateSpread,
} from '../../engine';
import { type Screen, app } from '../app';
import { drillHeader, pills } from '../components';
import { icon } from '../icons';
import { BANKROLL_UNITS, type BankrollSize } from '../storage';

const UNIT_CHOICES = [5, 10, 25, 50, 100];
const PRESETS: { id: string; name: string; spread: BetSpread }[] = [
  { id: 'default', name: '1–8', spread: DEFAULT_SPREAD as BetSpread },
  { id: 'flat', name: 'Flat', spread: { base: 1, steps: [] } },
  { id: 'wide', name: '1–12', spread: { base: 1, steps: [{ from: 2, units: 4 }, { from: 3, units: 8 }, { from: 4, units: 12 }] } },
];

const freqCache = new Map<string, Map<number, CountBin>>();

function fmt(n: number, digits = 0): string {
  return n.toLocaleString('en', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
function pct(x: number, digits = 2): string {
  return `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(digits)}%`;
}

export function bettingScreen(): Screen {
  let draft: BetSpread = structuredClone(app.prefs.spread);
  let outlook: SpreadOutlook | null = null;
  let houseEdge: number | null = null;
  let computing = false;

  const bankroll = () => BANKROLL_UNITS[app.prefs.bankrollSize] * app.prefs.unitPotatoes;

  function recompute() {
    outlook = null;
    if (validateSpread(draft).length) { app.render(); return; }
    computing = true;
    app.render();
    // Let the "working it out" state paint before the calculation runs.
    window.setTimeout(() => {
      const r = app.prefs.rules;
      const key = `${strategyKey(r)}|${r.penetration}|${app.prefs.table.others}`;
      let f = freqCache.get(key);
      if (!f) { f = trueCountFrequencies(r, app.prefs.table.others + 1, app.prefs.tcRounding); freqCache.set(key, f); }
      houseEdge = offTheTopReturn(r);
      outlook = spreadOutlook(r, draft, app.prefs.unitPotatoes, bankroll(), f);
      computing = false;
      app.render();
    }, 30);
  }

  function commit() {
    if (validateSpread(draft).length === 0) app.setPrefs({ spread: structuredClone(draft) });
    recompute();
  }

  const unitsSelect = (id: string, value: number) =>
    `<select data-spread="${id}" aria-label="Units">${Array.from({ length: 20 }, (_, i) => i + 1).map((u) => `<option value="${u}"${u === value ? ' selected' : ''}>${u} unit${u === 1 ? '' : 's'}</option>`).join('')}</select>`;
  const countSelect = (id: string, value: number) =>
    `<select data-spread="${id}" aria-label="True count">${Array.from({ length: 16 }, (_, i) => i - 4).map((t) => `<option value="${t}"${t === value ? ' selected' : ''}>${signed(t)}</option>`).join('')}</select>`;

  function spreadEditor(): string {
    const firstFrom = draft.steps[0]?.from;
    const rows = [
      `<div class="rule-row"><span>${firstFrom === undefined ? 'Every count' : `Up to ${signed(firstFrom - 1)}`}</span>${unitsSelect('base', draft.base)}</div>`,
      ...draft.steps.map((s, i) => `<div class="rule-row"><span class="spread-from">From ${countSelect(`from-${i}`, s.from)}</span>
        <span class="spread-right">${unitsSelect(`units-${i}`, s.units)}<button class="icon-btn small-btn" data-act="remove-step" data-value="${i}" aria-label="Remove this step">${icon.close()}</button></span></div>`),
    ].join('');
    const errors = validateSpread(draft);
    return `<div class="rules">${rows}</div>
      <button class="btn-secondary" data-act="add-step">Add a step</button>
      ${errors.length ? `<div class="index-warning small" role="alert">${icon.alert()} <span>${errors.join(' ')}</span></div>` : `<p class="small muted">${describeSpread(draft)}</p>`}`;
  }

  function outlookView(): string {
    if (validateSpread(draft).length) return '<p class="small muted">Fix the spread to see what to expect.</p>';
    if (computing || !outlook) return '<p class="small muted">Working it out…</p>';
    const o = outlook;
    const rows = o.edgeByCount.filter((b) => b.freq >= 0.003).map((b) =>
      `<tr><td>${signed(b.tc)}</td><td class="num">${(b.freq * 100).toFixed(1)}%</td><td class="num">${pct(b.edge, 1)}</td><td class="num">${b.units}</td></tr>`).join('');
    const edgeOfAction = o.perRound / o.avgBet;
    const br = bankroll();
    return `<table class="history"><thead><tr><th>True count</th><th class="num">How often</th><th class="num">Your edge</th><th class="num">Bet (units)</th></tr></thead><tbody>${rows}</tbody></table>
      <ul class="stack outlook">
        <li><span class="muted">${(houseEdge ?? 0) <= 0 ? 'Casino’s edge off the top, basic strategy' : 'Player’s edge off the top, basic strategy'}</span><strong>${Math.abs((houseEdge ?? 0) * 100).toFixed(2)}%</strong></li>
        <li><span class="muted">Average bet</span><strong>${fmt(o.avgBet, 1)} potatoes</strong></li>
        <li><span class="muted">Your edge on money bet</span><strong>${pct(edgeOfAction)}</strong></li>
        <li><span class="muted">Expected result per 100 rounds</span><strong>${o.per100 >= 0 ? '+' : '−'}${fmt(Math.abs(o.per100), 1)} potatoes</strong></li>
        <li><span class="muted">Typical swing per 100 rounds (1 SD)</span><strong>±${fmt(o.sdPer100)} potatoes</strong></li>
        <li><span class="muted">Risk of losing the whole ${fmt(br)}-potato bankroll</span><strong>${o.riskOfRuin >= 0.995 ? 'certain over time' : `about ${Math.round(o.riskOfRuin * 100)}%`}</strong></li>
        <li><span class="muted">Rounds before the edge outweighs normal swings</span><strong>${o.n0 === null ? 'never' : `about ${fmt(Math.round(o.n0 / 1000) * 1000)}`}</strong></li>
      </ul>
      <p class="small">Counting gives a small edge with large swings. You can lose for a long time while doing everything right, which is why the bankroll matters as much as the count.</p>
      <p class="small muted">Estimates from the trainer's strategy engine for your table rules: the edge at each count, how often each count comes up in dealt shoes, basic strategy with your spread (count plays and insurance add a little), and a standard risk formula. Casinos can refuse service to players they think are counting. Online random-number games and continuous shuffling machines can't be counted.</p>`;
  }

  queueMicrotask(recompute);

  return {
    render() {
      const sizes = (Object.keys(BANKROLL_UNITS) as BankrollSize[]).map((s) => ({
        value: s, label: `${s[0].toUpperCase()}${s.slice(1)} · ${fmt(BANKROLL_UNITS[s] * app.prefs.unitPotatoes)}`, on: s === app.prefs.bankrollSize,
      }));
      const presets = PRESETS.map((p) => ({ value: p.id, label: p.name, on: JSON.stringify(p.spread) === JSON.stringify(draft) }));
      return `<main class="screen">
        ${drillHeader('Bet spread and bankroll', undefined, 'Back to drills')}
        <section class="block">
          <h2 class="section-label">Unit</h2>
          ${pills('unit', UNIT_CHOICES.map((u) => ({ value: String(u), label: `${u}`, on: u === app.prefs.unitPotatoes })), 'Potatoes per unit')}
          <p class="small muted">Potatoes per betting unit. Potatoes are practice currency only.</p>
        </section>
        <section class="block">
          <h2 class="section-label">Practice bankroll</h2>
          ${pills('bankroll', sizes, 'Bankroll size')}
          <p class="small muted">${BANKROLL_UNITS[app.prefs.bankrollSize]} units. Used at the table simulation.</p>
        </section>
        <section class="block">
          <h2 class="section-label">Bet spread · by true count (${app.prefs.tcRounding === 'floor' ? 'rounded down' : app.prefs.tcRounding})</h2>
          ${pills('preset', presets, 'Spread presets')}
          ${spreadEditor()}
        </section>
        <section class="block"><h2 class="section-label">What to expect</h2>${outlookView()}</section>
      </main>`;
    },

    click(act, el) {
      const v = el.dataset.value ?? '';
      if (act === 'back') app.goHome();
      else if (act === 'unit') { app.setPrefs({ unitPotatoes: Number(v) }); recompute(); }
      else if (act === 'bankroll') { app.setPrefs({ bankrollSize: v as BankrollSize }); recompute(); }
      else if (act === 'preset') { draft = structuredClone(PRESETS.find((p) => p.id === v)!.spread); commit(); }
      else if (act === 'add-step') {
        const last = draft.steps.at(-1);
        draft.steps.push({ from: (last?.from ?? 1) + 1, units: Math.min(20, (last?.units ?? draft.base) + 2) });
        commit();
      } else if (act === 'remove-step') { draft.steps.splice(Number(v), 1); commit(); }
    },

    change(el) {
      const id = el.dataset.spread;
      if (!id) return;
      const n = Number(el.value);
      if (id === 'base') draft.base = n;
      else if (id.startsWith('from-')) draft.steps[Number(id.slice(5))].from = n;
      else if (id.startsWith('units-')) draft.steps[Number(id.slice(6))].units = n;
      commit();
    },
  };
}
