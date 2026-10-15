import {
  type Action, type Card, type TableHand, ACTION_LABEL, TableGame, cardPip, handValue, isBlackjack, pipName,
  recordBet, recordSession, signed,
} from '../../engine';
import { type Screen, app } from '../app';
import { cardHtml, hiddenCardHtml, type CardSize } from '../cards';
import { PausableTimeout, drillHeader, numpadHtml, numpadInput, numpadKey, optionRow, parseEntry, pills, tiles } from '../components';
import { icon } from '../icons';
import { BANKROLL_UNITS } from '../storage';
import { bettingScreen } from './betting';

type View = 'setup' | 'play' | 'summary';

const DECISION_SECONDS = 7;
const CHATTER = [
  'Dealer: Place your bets.',
  'Ana: Come on, give me a face card.',
  'Rui: I always hit sixteen. Always.',
  'Dealer: Good luck, everyone.',
  'Marta: This shoe is cold tonight.',
  'João: Double it! No, wait.',
  'A floor supervisor walks past the table.',
  'Dealer: Insurance is open. Anyone?',
];

const KEYS: Record<string, Action> = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' };

function money(n: number): string {
  return `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en')}`;
}

function resultTag(h: TableHand): string {
  if (!h.settlement) return '';
  const s = h.settlement;
  const label = { blackjack: 'Blackjack', win: 'Win', push: 'Push', lose: 'Lose', bust: 'Bust', surrender: 'Surrender' }[s.result];
  const cls = s.net > 0 ? 'good' : s.net < 0 ? 'bad' : 'muted';
  return `<span class="result-tag ${cls}">${label} ${s.net > 0 ? '+' : ''}${s.net === 0 ? '' : money(s.net)}</span>`;
}

export interface TableOptions {
  autostart?: boolean;
}

export function tableScreen(opts: TableOptions = {}): Screen {
  let view: View = 'setup';
  let game: TableGame | null = null;
  let revealed = false;
  let roundStart = 0; // index into game.decisions where this round began
  let countCheckDue = false;
  let countEntry = '';
  let countResult: string | null = null;
  let tilt: string | null = null;
  let paused = false;
  let timer: PausableTimeout | null = null;
  let decisionStart = 0;
  let chatter = '';
  let hintUsed = false;
  // Cards already on screen: only new ones animate in, in dealing order.
  let shown = new WeakSet<Card>();
  let dealIndex = 0;

  const prefs = () => app.prefs.table;
  const speed = () => (prefs().pressure ? 90 : 170);

  function start() {
    const p = app.prefs;
    game = new TableGame({
      rules: p.rules, spread: p.spread, unitPotatoes: p.unitPotatoes, bankroll: BANKROLL_UNITS[p.bankrollSize] * p.unitPotatoes,
      others: prefs().others, rounding: p.tcRounding,
    });
    revealed = false;
    tilt = null;
    roundStart = 0;
    shown = new WeakSet();
    view = 'play';
    beginBetting();
  }

  function beginBetting() {
    countResult = null;
    countEntry = '';
    countCheckDue = prefs().countCheckEvery > 0 && game!.round > 0 && game!.round % prefs().countCheckEvery === 0;
    chatter = prefs().pressure ? CHATTER[Math.floor(Math.random() * CHATTER.length)] : '';
    app.render();
  }

  function startDecisionClock() {
    decisionStart = performance.now();
    hintUsed = false;
    timer?.cancel();
    timer = null;
    if (prefs().pressure && game!.phase === 'playing') {
      timer = new PausableTimeout(() => {
        // Out of time: stand if you can, otherwise take the first allowed play. It is graded like any other.
        const allowed = game!.allowedActions();
        act(allowed.includes('stand') ? 'stand' : allowed[0], true);
      }, DECISION_SECONDS * 1000, paused);
    }
  }

  function afterAction() {
    game!.drainEvents();
    if (game!.phase === 'roundOver' || game!.phase === 'broke') {
      timer?.cancel();
      tilt = tilt ?? game!.tiltWarning();
    } else {
      startDecisionClock();
    }
    app.render();
  }

  function bet(units: number) {
    if (!game || game.phase !== 'betting' || countCheckDue) return;
    roundStart = game.decisions.length;
    dealIndex = 0;
    game.placeBet(units);
    recordBet(app.progress, game.lastBet!.verdict);
    app.saveProgress();
    afterAction();
  }

  function act(a: Action, timedOut = false) {
    if (!game || game.phase !== 'playing' || !game.allowedActions().includes(a)) return;
    const ms = timedOut ? DECISION_SECONDS * 1000 : performance.now() - decisionStart;
    game.decide(a, ms, hintUsed);
    afterAction();
  }

  function insure(take: boolean) {
    if (!game || game.phase !== 'insurance') return;
    game.insurance(take, performance.now() - decisionStart);
    afterAction();
  }

  function next() {
    if (!game || game.phase !== 'roundOver') return;
    dealIndex = 0;
    const shuffled = game.nextRound();
    game.drainEvents();
    if (shuffled) chatter = 'Dealer: Shuffling. The count starts again from zero.';
    beginBetting();
    if (shuffled) app.render();
  }

  function submitCount() {
    const n = parseEntry(countEntry);
    if (n === null || !game) return;
    const right = game.countCheck(n);
    countResult = right ? `Right: ${signed(game.runningCount)}.` : `Not quite: the running count is ${signed(game.runningCount)}.`;
    countCheckDue = false;
    app.render();
  }

  function endSession() {
    timer?.cancel();
    if (game && game.results.length) {
      const s = game.summary();
      recordSession(app.progress, {
        at: Date.now(), kind: 'table', label: `${s.rounds} rounds, ${s.net >= 0 ? '+' : ''}${money(s.net)} potatoes`,
        total: s.plays.total, correct: s.plays.correct, durationMs: 0,
      });
      app.saveProgress();
    }
    view = 'summary';
    app.render();
  }

  // ---------- Rendering ----------

  function cards(list: Card[], size: CardSize, hideSecond = false): string {
    return list.map((c, i) => {
      if (hideSecond && i === 1) return hiddenCardHtml(size);
      const isNew = !shown.has(c);
      shown.add(c);
      const html = cardHtml(c, size);
      if (!isNew) return html;
      const delay = (dealIndex++) * speed();
      return html.replace('class="card ', `style="animation-delay:${delay}ms" class="card deal-in `);
    }).join('');
  }

  function handLine(h: TableHand): string {
    const v = handValue(h.cards);
    if (isBlackjack(h.cards) && !h.fromSplit) return 'Blackjack';
    if (v.total > 21) return `Bust (${v.total})`;
    return `${v.soft ? 'Soft' : 'Hard'} ${v.total}`;
  }

  function tableView(): string {
    const g = game!;
    const holeHidden = !g.holeRevealed && g.dealer.length === 2;
    const others = g.seats.filter((s) => !s.hero).map((s) => {
      const h = s.hands[0];
      return `<div class="seat"><span class="small muted">${s.name}</span><div class="hand-row tight">${h ? cards(h.cards, 'small') : ''}</div>${h ? `<span class="small">${h.surrendered ? 'Surrendered' : handLine(h)} ${resultTag(h)}</span>` : ''}</div>`;
    }).join('');
    const heroHands = g.hero.hands.map((h, i) => {
      const active = g.phase === 'playing' && i === g.active && g.hero.hands.length > 1;
      return `<div class="hero-hand${active ? ' active' : ''}">
        <div class="area-label"><span class="small muted">Bet ${money(h.bet)}${h.doubled ? ' (doubled)' : ''}</span><span class="hand-type">${h.cards.length ? (h.surrendered ? 'Surrendered' : handLine(h)) : ''} ${resultTag(h)}</span></div>
        <div class="hand-row">${cards(h.cards, 'large')}</div></div>`;
    }).join('');
    const dealerValue = g.holeRevealed ? handLine({ cards: g.dealer } as TableHand) : g.dealer.length ? `Shows ${pipName(cardPip(g.dealer[0]))}` : '';
    const shoePct = Math.round((g.cardsLeft / (app.prefs.rules.decks * 52)) * 100);
    const count = revealed
      ? `<span>RC <strong>${signed(g.runningCount)}</strong> · TC <strong>${signed(g.trueCount)}</strong></span>`
      : '<span class="muted">Count hidden</span>';
    return `<main class="screen drill table-screen">
      ${drillHeader(`Table · Round ${Math.max(1, g.round)}`, undefined, 'End the session')}
      <div class="table-status small">
        <span>Bankroll <strong>${money(g.bankroll)}</strong> <span class="${g.bankroll - g.startingBankroll >= 0 ? 'good' : 'bad'}">(${g.bankroll - g.startingBankroll >= 0 ? '+' : ''}${money(g.bankroll - g.startingBankroll)})</span></span>
        <span class="muted">Shoe ${shoePct}% left</span>
      </div>
      ${chatter ? `<p class="chatter small muted">${chatter}</p>` : ''}
      <section class="table-area">
        <div class="area-label"><span class="section-label">Dealer</span><span class="hand-type">${dealerValue}</span></div>
        <div class="hand-row">${cards(g.dealer, 'large', holeHidden)}</div>
      </section>
      ${others ? `<section class="seats">${others}</section>` : ''}
      <section class="table-area"><div class="area-label"><span class="section-label">You</span></div>${heroHands || '<p class="small muted">Place a bet to deal.</p>'}</section>
      <div class="count-bar small">${count}<button class="btn-text" data-act="reveal">${revealed ? 'Hide count' : 'Reveal count'}</button></div>
      <div class="bottom">${controls()}</div>
    </main>`;
  }

  function controls(): string {
    const g = game!;
    if (tilt) {
      return `<section class="feedback tilt"><p>${tilt}</p>
        <div class="pills"><button class="pill" data-act="tilt-break">Take a break</button><button class="pill" data-act="tilt-continue">Keep playing</button></div></section>`;
    }
    if (paused) return '<p class="small muted center-text">Paused</p><button class="btn-primary" data-act="resume">Back to the table</button>';
    if (g.phase === 'betting') {
      if (countCheckDue) return numpadHtml(countEntry, 'Count check: running count?', 'Check my count');
      const opts = g.betOptions();
      return `${countResult ? `<p class="small center-text">${countResult}</p>` : ''}
        <p class="small muted center-text">Your bet, in units of ${app.prefs.unitPotatoes}</p>
        <div class="bet-grid">${opts.map((u) => `<button class="btn-action bet-btn" data-act="bet" data-value="${u}" aria-keyshortcuts="${u}"><span>${u}</span><span class="small">${money(u * app.prefs.unitPotatoes)}</span></button>`).join('')}</div>`;
    }
    if (g.phase === 'insurance') {
      return `<p class="small center-text">Dealer shows an Ace. Insurance?</p>
        <div class="action-grid"><button class="btn-action" data-act="insure" data-value="yes" aria-keyshortcuts="Y">Take insurance</button><button class="btn-action" data-act="insure" data-value="no" aria-keyshortcuts="N">No insurance</button></div>`;
    }
    if (g.phase === 'playing') {
      const allowed = g.allowedActions();
      const btn = (a: Action, key: string, cls = 'btn-action') =>
        `<button class="${cls}" data-act="act" data-value="${a}" aria-keyshortcuts="${key}"${allowed.includes(a) ? '' : ' disabled'}>${ACTION_LABEL[a]}</button>`;
      const hint = prefs().hints ? `<p class="small muted center-text hint-line">${hintUsed ? g.hint() : '<button class="btn-text" data-act="hint">Show hint</button>'}</p>` : '';
      // The bar keeps its real position across redraws: start the animation part-way through.
      const elapsed = Math.round(performance.now() - decisionStart);
      const clock = prefs().pressure ? `<div class="progress timer" role="timer" aria-label="Time to decide"><div style="animation-duration:${DECISION_SECONDS}s;animation-delay:-${elapsed}ms${paused || app.chartOpen ? ';animation-play-state:paused' : ''}"></div></div>` : '';
      return `${clock}${hint}<div class="action-grid">${btn('hit', 'H')}${btn('stand', 'S')}${btn('double', 'D')}${btn('split', 'P')}</div>
        ${app.prefs.rules.surrender === 'late' ? btn('surrender', 'R', 'btn-secondary') : ''}`;
    }
    // Round over or broke: what happened, then the way on.
    const round = g.decisions.slice(roundStart);
    const wrong = round.filter((d) => !d.correct && d.kind !== 'count');
    const last = g.results.at(-1)!;
    const notes = wrong.map((d) => `<li>${icon.cross(14)} <span><strong>${d.situation}:</strong> ${d.kind === 'bet' ? d.note : `you chose ${d.chosen}, best ${d.best}. ${d.note}`}</span></li>`).join('');
    const ok = round.filter((d) => d.kind !== 'count').length;
    const head = `<p class="center-text"><strong>${last.net > 0 ? `You won ${money(last.net)}` : last.net < 0 ? `You lost ${money(-last.net)}` : 'Push'}</strong>${wrong.length === 0 && ok ? ` <span class="good small">· all ${ok} decision${ok === 1 ? '' : 's'} right</span>` : ''}</p>`;
    const list = wrong.length ? `<ul class="round-notes small">${notes}</ul>` : '';
    if (g.phase === 'broke') return `${head}${list}<p class="center-text bad">Out of potatoes.</p><button class="btn-primary" data-act="end">See the summary</button>`;
    return `${head}${list}<button class="btn-primary" data-act="next" aria-keyshortcuts="Enter">Next round</button>`;
  }

  function summaryView(): string {
    const g = game!;
    const s = g.summary();
    const pc = (t: { total: number; correct: number }) => (t.total ? `${Math.round((t.correct / t.total) * 100)}%` : '–');
    const mistakes = s.mistakes.map((d) => `<li class="path-row static"><span class="small">${d.situation}</span><span class="small"><span class="muted">${d.chosen} →</span> <span class="good">${d.best}</span></span></li>`).join('');
    return `<main class="screen">
      ${drillHeader('Table session', undefined, 'Back to table setup')}
      ${tiles([['Rounds', String(s.rounds)], ['Potatoes', `${s.net >= 0 ? '+' : ''}${money(s.net)}`], ['Decisions', pc(s.plays)]])}
      ${tiles([['Bets', pc(s.bets)], ['Count checks', pc(s.counts)], ['Insurance', pc(s.insurance)]])}
      <p class="small muted">Bets: ${s.bets.over} over the spread, ${s.bets.under} under. Results over a few dozen rounds are mostly luck; the decision and bet scores are what you control.</p>
      ${mistakes ? `<section class="block"><h2 class="section-label">Main mistakes</h2><ul class="stack">${mistakes}</ul></section>` : '<p>No mistakes this session.</p>'}
      <div class="bottom">
        <button class="btn-primary" data-act="start">Play again</button>
        <button class="btn-secondary" data-act="back">Done</button>
      </div>
    </main>`;
  }

  function setupView(): string {
    const t = prefs();
    const p = app.prefs;
    const others = pills('others', [0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n), on: n === t.others })), 'Other players');
    const checks = pills('checks', [0, 4, 6, 10].map((n) => ({ value: String(n), label: n ? `Every ${n}` : 'Off', on: n === t.countCheckEvery })), 'Count checks');
    return `<main class="screen">
      ${drillHeader('Table simulation', undefined, 'Back to drills')}
      <p class="small muted">A full table: ${p.rules.decks === 8 ? 'an' : 'a'} ${p.rules.decks}-deck shoe with a cut card at ${Math.round(p.rules.penetration * 100)}%, other players before you, and ${money(BANKROLL_UNITS[p.bankrollSize] * p.unitPotatoes)} practice potatoes. The count is hidden; keep it yourself. Every bet and decision is checked against your spread and the strategy engine at the true count.</p>
      <button class="btn-text left" data-act="spread">Change the spread, unit or bankroll</button>
      <section class="block"><h2 class="section-label">Other players</h2>${others}</section>
      <section class="block"><h2 class="section-label">Count checks</h2>${checks}<p class="small muted">Asks for your running count before a bet, every few rounds.</p></section>
      <section class="block"><h2 class="section-label">Options</h2><div class="stack">
        ${optionRow('hints', 'toggle', 'Hints', 'Show the best play on request (off by default)', t.hints)}
        ${optionRow('pressure', 'toggle', 'Pressure mode', `A ${DECISION_SECONDS}-second clock per decision, table chatter, faster dealing`, t.pressure)}
      </div></section>
      <div class="bottom"><button class="btn-primary" data-act="start">Sit down</button></div>
    </main>`;
  }

  if (opts.autostart) queueMicrotask(() => start());

  return {
    render() {
      if (view === 'play' && game) return tableView();
      if (view === 'summary' && game) return summaryView();
      return setupView();
    },

    click(a, el) {
      const v = el.dataset.value ?? '';
      const t = prefs();
      switch (a) {
        case 'back':
          if (view === 'play') endSession();
          else if (view === 'summary') { view = 'setup'; app.render(); }
          else app.goHome();
          break;
        case 'spread': app.go(bettingScreen()); break;
        case 'others': app.setPrefs({ table: { ...t, others: Number(v) } }); app.render(); break;
        case 'checks': app.setPrefs({ table: { ...t, countCheckEvery: Number(v) } }); app.render(); break;
        case 'hints': app.setPrefs({ table: { ...t, hints: !t.hints } }); app.render(); break;
        case 'pressure': app.setPrefs({ table: { ...t, pressure: !t.pressure } }); app.render(); break;
        case 'start': start(); break;
        case 'bet': bet(Number(v)); break;
        case 'act': act(v as Action); break;
        case 'insure': insure(v === 'yes'); break;
        case 'next': next(); break;
        case 'end': endSession(); break;
        case 'reveal': revealed = !revealed; app.render(); break;
        case 'hint': hintUsed = true; app.render(); break;
        case 'tilt-break': tilt = null; paused = true; timer?.pause(); app.render(); break;
        case 'tilt-continue': tilt = null; app.render(); break;
        case 'resume': paused = false; timer?.resume(); app.render(); break;
        case 'np-submit': submitCount(); break;
        default: {
          const n = numpadInput(countEntry, a, v);
          if (n !== null) { countEntry = n; app.render(); }
        }
      }
    },

    key(e) {
      if (view !== 'play' || !game || tilt || paused) return false;
      const k = e.key.toLowerCase();
      if (game.phase === 'betting' && countCheckDue) {
        if (e.key === 'Enter') { submitCount(); return true; }
        const n = numpadKey(countEntry, e);
        if (n !== null) { countEntry = n; app.render(); return true; }
        return false;
      }
      if (game.phase === 'betting' && /^[1-9]$/.test(k) && game.betOptions().includes(Number(k))) { bet(Number(k)); return true; }
      if (game.phase === 'insurance' && (k === 'y' || k === 'n')) { insure(k === 'y'); return true; }
      if (game.phase === 'playing' && KEYS[k]) { act(KEYS[k]); return true; }
      if (game.phase === 'roundOver' && e.key === 'Enter') { next(); return true; }
      return false;
    },

    chartFocus: () => (game && game.phase === 'playing' ? { ...game.advice(), best: game.advice().basicBest } : null),

    pause() {
      if (view !== 'play') return;
      timer?.pause();
    },
    resume() {
      if (view !== 'play' || paused) return;
      timer?.resume();
    },
    leave() { timer?.cancel(); },
  };
}
