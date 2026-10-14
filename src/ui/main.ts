import './styles.css';
import {
  type Action, type Advice, type DeckCount, type DoubleOn, type DrillFilter, type DrillHand, type FollowUp,
  type Rules, ACTION_LABEL, DRILL_FILTER_LABEL, RULE_PRESETS, SIX_TO_FIVE_WARNING, availableActions, bestPlay,
  buildChart, dealDrillHand, explain, followUp, mistakeCost, per100, pipName, rulesSummary, samePattern,
  strategyKey,
} from '../engine';
import { cardHtml, hiddenCardHtml } from './cards';
import { chartHtml } from './chart';
import { icon } from './icons';
import { load, save } from './storage';

const HANDS_PER_SESSION = 20;
const CORRECT_FLASH_MS = 450;

type View = 'setup' | 'hand' | 'wrong' | 'done';

interface Mistake {
  hand: DrillHand;
  advice: Advice;
  chosen: Action;
}

interface Session {
  filter: DrillFilter;
  index: number;
  correct: number;
  streak: number;
  bestStreak: number;
  hand: DrillHand;
  advice: Advice;
  mistakes: Mistake[];
}

interface WrongState {
  chosen: Action;
  quiz: FollowUp | null;
  quizAnswer: Action | null;
}

const saved = load();
const state = {
  rules: saved.rules,
  filter: saved.filter,
  view: 'setup' as View,
  session: null as Session | null,
  wrong: null as WrongState | null,
  chartOpen: false,
  flashing: false,
};

const app = document.getElementById('app')!;
const overlay = document.getElementById('overlay')!;
const live = document.getElementById('live')!;

function persist() {
  save({ rules: state.rules, filter: state.filter });
}

function chartButton(): string {
  return `<button class="icon-btn" data-act="open-chart" aria-label="Basic strategy chart" aria-keyshortcuts="C"${state.flashing ? ' disabled' : ''}>${icon.grid()}</button>`;
}

function drillHeader(s: Session): string {
  const pct = ((s.index + (state.view === 'hand' && !state.flashing ? 0 : 1)) / HANDS_PER_SESSION) * 100;
  return `<header class="drill-top">
      <button class="icon-btn" data-act="quit" aria-label="Back to drill setup">${icon.back()}</button>
      <div class="drill-title">${DRILL_FILTER_LABEL[s.filter]} · Hand ${s.index + 1} of ${HANDS_PER_SESSION}</div>
      ${chartButton()}
    </header>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${HANDS_PER_SESSION}" aria-valuenow="${s.index}"><div style="width:${pct}%"></div></div>`;
}

// ---------- Setup ----------

function select<T extends string | number>(id: string, label: string, value: T, options: [T, string][]): string {
  const opts = options.map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${l}</option>`).join('');
  return `<label class="rule-row" for="${id}"><span>${label}</span><select id="${id}" data-rule="${id}">${opts}</select></label>`;
}

function setupView(): string {
  const r = state.rules;
  const filters = (Object.keys(DRILL_FILTER_LABEL) as DrillFilter[]).map((f) => {
    const on = f === state.filter;
    return `<button class="path-row${on ? ' current' : ''}" data-act="filter" data-filter="${f}" aria-pressed="${on}">
      <span>${DRILL_FILTER_LABEL[f]}</span><span class="muted">${on ? icon.check(18) : ''}</span></button>`;
  }).join('');
  const key = strategyKey(r);
  const presets = RULE_PRESETS.map((p) => {
    const on = strategyKey(p.rules) === key && p.rules.blackjackPays === r.blackjackPays;
    return `<button class="pill${on ? ' on' : ''}" data-act="preset" data-preset="${p.id}" aria-pressed="${on}">${p.name}</button>`;
  }).join('');

  return `<main class="screen">
    <header class="home-top">
      <h1 class="title">Drill</h1>
      <div class="home-top-right"><span class="small muted">${rulesSummary(r)}</span>${chartButton()}</div>
    </header>

    <section class="block">
      <h2 class="section-label">What to practise</h2>
      <div class="stack">${filters}</div>
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
      </div>
      <p class="small muted">The chart and every answer are computed for these rules. Check the posted rules at your table.</p>
    </section>

    <div class="bottom"><button class="btn-primary" data-act="start">Start drill</button></div>
  </main>`;
}

function applyRule(id: string, value: string) {
  const r: Rules = { ...state.rules };
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
  }
  state.rules = r;
  persist();
  render();
}

// ---------- Drill ----------

function newHand(s: Session) {
  s.hand = dealDrillHand(s.filter, state.rules);
  s.advice = bestPlay(s.hand.player, s.hand.upcard, state.rules);
}

function startSession() {
  const hand = dealDrillHand(state.filter, state.rules);
  state.session = {
    filter: state.filter, index: 0, correct: 0, streak: 0, bestStreak: 0, hand,
    advice: bestPlay(hand.player, hand.upcard, state.rules), mistakes: [],
  };
  state.view = 'hand';
  render();
}

function handView(s: Session): string {
  const allowed = availableActions(s.hand.player, state.rules);
  const btn = (a: Action, key: string) => {
    const ok = allowed.includes(a);
    return `<button class="btn-action" data-act="answer" data-action="${a}" aria-keyshortcuts="${key}"${ok && !state.flashing ? '' : ' disabled'}>${ACTION_LABEL[a]}</button>`;
  };
  const actions = state.flashing
    ? `<div class="flash" role="status">${icon.check(28)}<span>Correct</span></div>`
    : `<div class="action-grid">${btn('hit', 'H')}${btn('stand', 'S')}${btn('double', 'D')}${btn('split', 'P')}</div>
       ${state.rules.surrender === 'late' ? `<button class="btn-secondary" data-act="answer" data-action="surrender" aria-keyshortcuts="R"${allowed.includes('surrender') ? '' : ' disabled'}>Surrender</button>` : ''}`;
  return `<main class="screen drill">
    ${drillHeader(s)}
    <section class="table-area">
      <div class="area-label"><span class="section-label">Dealer shows ${pipName(s.advice.upcard)}</span></div>
      <div class="hand-row">${cardHtml(s.hand.upcard)}${hiddenCardHtml()}</div>
    </section>
    <section class="table-area">
      <div class="area-label"><span class="section-label">Your hand</span><span class="hand-type">${s.advice.handLabel}</span></div>
      <div class="hand-row">${s.hand.player.map((c) => cardHtml(c)).join('')}</div>
    </section>
    <div class="bottom actions${state.flashing ? ' is-flashing' : ''}">${actions}</div>
  </main>`;
}

function answer(action: Action) {
  const s = state.session;
  if (!s || state.view !== 'hand' || state.flashing || state.chartOpen) return;
  if (!availableActions(s.hand.player, state.rules).includes(action)) return;
  if (action === s.advice.best) {
    s.correct++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    state.flashing = true;
    live.textContent = 'Correct';
    render();
    window.setTimeout(() => {
      state.flashing = false;
      advance();
    }, CORRECT_FLASH_MS);
  } else {
    s.streak = 0;
    s.mistakes.push({ hand: s.hand, advice: s.advice, chosen: action });
    state.wrong = { chosen: action, quiz: followUp(s.advice, state.rules), quizAnswer: null };
    state.view = 'wrong';
    live.textContent = `Not quite. Best move: ${ACTION_LABEL[s.advice.best]}`;
    render();
  }
}

function advance() {
  const s = state.session!;
  state.wrong = null;
  if (s.index + 1 >= HANDS_PER_SESSION) {
    state.view = 'done';
  } else {
    s.index++;
    newHand(s);
    state.view = 'hand';
  }
  render();
}

function wrongView(s: Session, w: WrongState): string {
  const a = s.advice;
  const cost = mistakeCost(a, w.chosen);
  const evOf = (x: Action) => a.options.find((o) => o.action === x)!.ev;
  const pattern = samePattern(a, state.rules);
  let quiz = '';
  if (w.quiz) {
    const q = w.quiz;
    const pills = q.options.map((o) => {
      let cls = 'pill';
      if (w.quizAnswer) {
        if (o === q.answer) cls += ' right';
        else if (o === w.quizAnswer) cls += ' wrong';
      }
      return `<button class="${cls}" data-act="quiz" data-action="${o}"${w.quizAnswer ? ' disabled' : ''}>${ACTION_LABEL[o]}</button>`;
    }).join('');
    const result = w.quizAnswer
      ? w.quizAnswer === q.answer
        ? `<p class="quiz-result ok">${icon.check(16)} Right: ${ACTION_LABEL[q.answer].toLowerCase()}.</p>`
        : `<p class="quiz-result bad">${icon.cross(16)} Not quite: ${ACTION_LABEL[q.answer].toLowerCase()}.</p>`
      : '';
    quiz = `<section class="quiz"><p>${q.question}</p><div class="pills">${pills}</div>${result}</section>`;
  }
  return `<main class="screen drill">
    ${drillHeader(s)}
    <div class="recap">
      <div class="hand-row">${s.hand.player.map((c) => cardHtml(c, 'small')).join('')}</div>
      <span class="muted small">vs dealer</span>
      ${cardHtml(s.hand.upcard, 'small')}
      <span class="hand-type">${a.handLabel}</span>
    </div>
    <section class="feedback">
      <div class="feedback-head"><span class="bad-icon">${icon.cross(18)}</span><div><strong>Not quite</strong><p class="small muted">${cost.label}</p></div></div>
      <div class="moves">
        <div><div class="section-label">Your move</div><div class="move">${ACTION_LABEL[w.chosen]}</div><div class="small muted">${per100(evOf(w.chosen))} per 100 bet</div></div>
        <div><div class="section-label">Best move</div><div class="move good">${ACTION_LABEL[a.best]}</div><div class="small muted">${per100(a.options[0].ev)} per 100 bet</div></div>
      </div>
      <div><div class="section-label">Why</div><p>${explain(a)}</p></div>
      ${pattern ? `<div><div class="section-label">Same pattern</div><p>${pattern}</p></div>` : ''}
    </section>
    ${quiz}
    <div class="bottom">
      <button class="btn-primary" data-act="next">Next hand</button>
      <button class="btn-text" data-act="show-cell">Show this on the chart</button>
    </div>
  </main>`;
}

function doneView(s: Session): string {
  const acc = Math.round((s.correct / HANDS_PER_SESSION) * 100);
  const list = s.mistakes.map((m) =>
    `<li class="path-row static"><span>${m.advice.handLabel} vs ${pipName(m.advice.upcard)}</span><span class="small"><span class="muted">${ACTION_LABEL[m.chosen]} →</span> <span class="good">${ACTION_LABEL[m.advice.best]}</span></span></li>`).join('');
  return `<main class="screen">
    <header class="home-top"><h1 class="title">Session done</h1><div class="home-top-right">${chartButton()}</div></header>
    <div class="tiles">
      <div class="tile"><div class="tile-label">Accuracy</div><div class="tile-value">${acc}%</div></div>
      <div class="tile"><div class="tile-label">Correct</div><div class="tile-value">${s.correct}/${HANDS_PER_SESSION}</div></div>
      <div class="tile"><div class="tile-label">Best streak</div><div class="tile-value">${s.bestStreak}</div></div>
    </div>
    ${s.mistakes.length ? `<section class="block"><h2 class="section-label">Missed hands</h2><ul class="stack">${list}</ul></section>` : `<p>No mistakes this session.</p>`}
    <div class="bottom">
      <button class="btn-primary" data-act="start">Drill again</button>
      <button class="btn-secondary" data-act="quit">Change drill</button>
    </div>
  </main>`;
}

// ---------- Chart overlay ----------

let chartReturnFocus: HTMLElement | null = null;

function openChart(withHand: boolean) {
  if (state.chartOpen || state.flashing) return;
  chartReturnFocus = document.activeElement as HTMLElement | null;
  state.chartOpen = true;
  const focus = withHand && state.session && state.view !== 'setup' && state.view !== 'done' ? state.session.advice : null;
  overlay.innerHTML = chartHtml(buildChart(state.rules), focus);
  document.body.classList.add('no-scroll');
  overlay.querySelector<HTMLElement>('[data-act="close-chart"]')?.focus();
  overlay.querySelector('[data-ring]')?.scrollIntoView({ block: 'center' });
}

function closeChart() {
  if (!state.chartOpen) return;
  state.chartOpen = false;
  overlay.innerHTML = '';
  document.body.classList.remove('no-scroll');
  chartReturnFocus?.focus();
}

// ---------- Render and events ----------

function render() {
  const s = state.session;
  if (state.view === 'hand' && s) app.innerHTML = handView(s);
  else if (state.view === 'wrong' && s && state.wrong) app.innerHTML = wrongView(s, state.wrong);
  else if (state.view === 'done' && s) app.innerHTML = doneView(s);
  else app.innerHTML = setupView();
}

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  switch (el.dataset.act) {
    case 'open-chart': openChart(true); break;
    case 'close-chart': closeChart(); break;
    case 'show-cell': openChart(true); break;
    case 'filter': state.filter = el.dataset.filter as DrillFilter; persist(); render(); break;
    case 'preset': {
      const p = RULE_PRESETS.find((x) => x.id === el.dataset.preset);
      if (p) { state.rules = { ...p.rules }; persist(); render(); }
      break;
    }
    case 'start': startSession(); break;
    case 'quit': state.view = 'setup'; state.session = null; state.wrong = null; render(); break;
    case 'answer': answer(el.dataset.action as Action); break;
    case 'next': advance(); break;
    case 'quiz':
      if (state.wrong && !state.wrong.quizAnswer) { state.wrong.quizAnswer = el.dataset.action as Action; render(); }
      break;
  }
});

document.addEventListener('change', (e) => {
  const el = e.target as HTMLSelectElement;
  if (el.dataset.rule) applyRule(el.dataset.rule, el.value);
});

const KEY_ACTIONS: Record<string, Action> = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' };

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.target as HTMLElement).tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  if (state.chartOpen) {
    if (k === 'escape' || k === 'c') { e.preventDefault(); closeChart(); }
    return;
  }
  if (k === 'c') { e.preventDefault(); openChart(true); return; }
  if (state.view === 'hand' && KEY_ACTIONS[k]) { e.preventDefault(); answer(KEY_ACTIONS[k]); return; }
  if (state.view === 'wrong' && k === 'enter' && document.activeElement === document.body) { e.preventDefault(); advance(); }
});

// Keep focus inside the chart dialog while it is open.
overlay.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const close = overlay.querySelector<HTMLElement>('[data-act="close-chart"]');
  if (close) { e.preventDefault(); close.focus(); }
});

render();
