import {
  type CountPlayAnswer, type CountPlayMode, type CountPlayQuestion, ACTION_LABEL, COUNT_PLAY_MODES,
  INSURANCE_DEVIATION, ROUNDING_LABEL, availableActions, classLabel, explainCountPlay, indexMismatch,
  makeCountPlayQuestion, pipName, recordDeviation, recordSession, signed, sourceStatus,
} from '../../engine';
import { type Screen, app } from '../app';
import { cardHtml, hiddenCardHtml } from '../cards';
import { drillHeader, optionRow, tiles } from '../components';
import { icon } from '../icons';

const QUESTIONS = 20;
const CORRECT_FLASH_MS = 600;

type Phase = 'setup' | 'question' | 'wrong' | 'done';

const ANSWER_LABEL: Record<CountPlayAnswer, string> = {
  ...ACTION_LABEL,
  insurance: 'Take insurance',
  'no-insurance': 'No insurance',
};

const KEYS: Record<string, CountPlayAnswer> = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender', y: 'insurance', n: 'no-insurance' };

export interface CountPlayOptions {
  autostart?: boolean;
}

export function countPlayScreen(opts: CountPlayOptions = {}): Screen {
  let phase: Phase = 'setup';
  let mode: CountPlayMode = 'shown';
  let q: CountPlayQuestion | null = null;
  let index = 0;
  let correct = 0;
  let chosen: CountPlayAnswer | null = null;
  let flashing = false;
  let flashTimer: number | null = null;
  let startedAt = 0;
  const missed: { q: CountPlayQuestion; chosen: CountPlayAnswer }[] = [];

  const blocked = () => indexMismatch(INSURANCE_DEVIATION.source, app.prefs.tcRounding, app.prefs.rules);

  function ask() {
    q = makeCountPlayQuestion(app.prefs.rules, app.prefs.tcRounding, mode);
    chosen = null;
    phase = 'question';
    app.render();
  }

  function start() {
    if (blocked()) return;
    index = 0;
    correct = 0;
    missed.length = 0;
    startedAt = Date.now();
    ask();
  }

  function allowed(question: CountPlayQuestion): CountPlayAnswer[] {
    if (question.row.group === 'insurance') return ['insurance', 'no-insurance'];
    return availableActions(question.player, app.prefs.rules);
  }

  function answer(a: CountPlayAnswer) {
    if (!q || phase !== 'question' || flashing || !allowed(q).includes(a)) return;
    chosen = a;
    const right = a === q.answer;
    recordDeviation(app.progress, q.row.id, right);
    app.saveProgress();
    if (right) {
      correct++;
      flashing = true;
      app.announce('Correct');
      app.render();
      flashTimer = window.setTimeout(() => { flashing = false; flashTimer = null; advance(); }, CORRECT_FLASH_MS);
    } else {
      missed.push({ q, chosen: a });
      phase = 'wrong';
      app.announce(`Not quite. ${ANSWER_LABEL[q.answer]}`);
      app.render();
    }
  }

  function advance() {
    if (index + 1 >= QUESTIONS) {
      recordSession(app.progress, {
        at: Date.now(), kind: 'deviation', label: mode === 'shown' ? 'True count shown' : 'Work out the true count',
        total: QUESTIONS, correct, durationMs: Date.now() - startedAt,
      });
      app.saveProgress();
      phase = 'done';
      app.render();
      return;
    }
    index++;
    ask();
  }

  function header() {
    const done = index + (phase === 'question' && !flashing ? 0 : 1);
    return drillHeader(`Play the count · Hand ${index + 1} of ${QUESTIONS}`, done / QUESTIONS, 'Back to play-the-count setup');
  }

  function countBlock(question: CountPlayQuestion): string {
    if (question.running !== undefined) {
      return `<div class="givens">
        <div class="given"><span class="section-label">Running count</span><span class="given-value">${signed(question.running)}</span></div>
        <div class="given"><span class="section-label">Decks left</span><span class="given-value">${question.decksLeft}</span></div>
      </div>`;
    }
    return `<div class="given count-given"><span class="section-label">True count</span><span class="given-value">${signed(question.trueCount)}</span></div>`;
  }

  function handLabel(question: CountPlayQuestion): string {
    if (question.row.group === 'insurance') return 'Insurance?';
    return question.player.length > 2 ? `${question.advice!.handLabel} (${question.player.length} cards)` : question.advice!.handLabel;
  }

  function questionView(): string {
    const question = q!;
    const ok = allowed(question);
    const btn = (a: CountPlayAnswer, key: string, cls = 'btn-action') =>
      `<button class="${cls}" data-act="answer" data-value="${a}" aria-keyshortcuts="${key}"${ok.includes(a) && !flashing ? '' : ' disabled'}>${ANSWER_LABEL[a]}</button>`;
    let actions: string;
    if (flashing) actions = `<div class="flash" role="status">${icon.check(28)}<span>Correct</span></div>`;
    else if (question.row.group === 'insurance') actions = `<div class="action-grid">${btn('insurance', 'Y')}${btn('no-insurance', 'N')}</div>`;
    else {
      actions = `<div class="action-grid">${btn('hit', 'H')}${btn('stand', 'S')}${btn('double', 'D')}${btn('split', 'P')}</div>
        ${app.prefs.rules.surrender === 'late' ? btn('surrender', 'R', 'btn-secondary') : ''}`;
    }
    return `<main class="screen drill">
      ${header()}
      ${countBlock(question)}
      <section class="table-area">
        <div class="area-label"><span class="section-label">Dealer shows ${pipName(question.row.upcard)}</span></div>
        <div class="hand-row">${cardHtml(question.upcard)}${hiddenCardHtml()}</div>
      </section>
      <section class="table-area">
        <div class="area-label"><span class="section-label">Your hand</span><span class="hand-type">${handLabel(question)}</span></div>
        <div class="hand-row">${question.player.map((c) => cardHtml(c)).join('')}</div>
      </section>
      <div class="bottom actions${flashing ? ' is-flashing' : ''}">${actions}</div>
    </main>`;
  }

  function wrongView(): string {
    const question = q!;
    return `<main class="screen drill">
      ${header()}
      <div class="recap">
        <div class="hand-row">${question.player.map((c) => cardHtml(c, 'small')).join('')}</div>
        <span class="muted small">vs dealer</span>
        ${cardHtml(question.upcard, 'small')}
        <span class="hand-type">TC ${signed(question.trueCount)}</span>
      </div>
      <section class="feedback">
        <div class="feedback-head"><span class="bad-icon">${icon.cross(18)}</span><div><strong>Not quite</strong>${question.row.confidence === 'close' ? '<p class="small muted">A close call near the index</p>' : ''}</div></div>
        <div class="moves">
          <div><div class="section-label">Your move</div><div class="move">${ANSWER_LABEL[chosen!]}</div></div>
          <div><div class="section-label">At this count</div><div class="move good">${ANSWER_LABEL[question.answer]}</div></div>
        </div>
        <div><div class="section-label">Why</div><p>${explainCountPlay(question)}</p></div>
      </section>
      <div class="bottom">
        <button class="btn-primary" data-act="next">${index + 1 >= QUESTIONS ? 'See results' : 'Next hand'}</button>
        ${question.advice?.chart ? '<button class="btn-text" data-act="show-cell">Show the basic play on the chart</button>' : ''}
      </div>
    </main>`;
  }

  function doneView(): string {
    const list = missed.map((m) => {
      const what = m.q.row.group === 'insurance' ? 'Insurance' : `${classLabel(m.q.row.hand!)} vs ${pipName(m.q.row.upcard)}`;
      return `<li class="path-row static"><span>${what} at ${signed(m.q.trueCount)}</span><span class="small"><span class="muted">${ANSWER_LABEL[m.chosen]} →</span> <span class="good">${ANSWER_LABEL[m.q.answer]}</span></span></li>`;
    }).join('');
    return `<main class="screen">
      ${drillHeader('Play the count: results', undefined, 'Back to play-the-count setup')}
      ${tiles([['Accuracy', `${Math.round((correct / QUESTIONS) * 100)}%`], ['Correct', `${correct}/${QUESTIONS}`]])}
      ${missed.length ? `<section class="block"><h2 class="section-label">Missed</h2><ul class="stack">${list}</ul></section>` : '<p>No mistakes this session.</p>'}
      <div class="bottom">
        <button class="btn-primary" data-act="start">Again</button>
        <button class="btn-secondary" data-act="back">Change drill</button>
      </div>
    </main>`;
  }

  function setupView(): string {
    const warning = blocked();
    const modes = COUNT_PLAY_MODES.map((m) => optionRow('mode', m.id, m.name, m.detail, m.id === mode)).join('');
    return `<main class="screen">
      ${drillHeader('Play the count', undefined, 'Back to drills')}
      <p class="small muted">Hands where the right play depends on the true count: the Illustrious 18, the Fab 4 surrenders and insurance. Counts are ${ROUNDING_LABEL[app.prefs.tcRounding].toLowerCase()}.</p>
      <section class="block"><h2 class="section-label">Mode</h2><div class="stack">${modes}</div></section>
      ${warning ? `<p class="index-warning small" role="note">${icon.alert()} <span>${warning}</span></p>` : ''}
      <p class="small muted">Index numbers: ${sourceStatus(INSURANCE_DEVIATION.source)}</p>
      <div class="bottom"><button class="btn-primary" data-act="start"${warning ? ' disabled' : ''}>Start · ${QUESTIONS} hands</button></div>
    </main>`;
  }

  if (opts.autostart) queueMicrotask(() => start());

  return {
    render() {
      if (phase === 'question' && q) return questionView();
      if (phase === 'wrong' && q) return wrongView();
      if (phase === 'done') return doneView();
      return setupView();
    },

    click(act, el) {
      const v = el.dataset.value ?? '';
      switch (act) {
        case 'back':
          if (phase === 'setup') app.goHome();
          else { if (flashTimer !== null) clearTimeout(flashTimer); flashing = false; phase = 'setup'; app.render(); }
          break;
        case 'mode': mode = v as CountPlayMode; app.render(); break;
        case 'start': start(); break;
        case 'answer': answer(v as CountPlayAnswer); break;
        case 'next': advance(); break;
        case 'show-cell': app.openChart(); break;
      }
    },

    key(e) {
      const k = e.key.toLowerCase();
      if (phase === 'question' && KEYS[k]) { answer(KEYS[k]); return true; }
      if (phase === 'wrong' && k === 'enter' && document.activeElement === document.body) { advance(); return true; }
      return false;
    },

    // The chart is basic strategy, so ring the basic play's cell, not the count play.
    chartFocus: () => (q && q.advice && (phase === 'question' || phase === 'wrong') ? { ...q.advice, best: q.advice.basicBest } : null),
    chartBlocked: () => flashing,

    leave() {
      if (flashTimer !== null) clearTimeout(flashTimer);
    },
  };
}

