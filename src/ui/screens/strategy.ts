import {
  type Action, type Advice, type DrillFilter, type DrillHand, type FollowUp, ACTION_LABEL, DRILL_FILTER_LABEL,
  availableActions, bestPlay, dealDrillHand, explain, followUp, mistakeCost, per100, pipName, samePattern,
} from '../../engine';
import { type Screen, app } from '../app';
import { cardHtml, hiddenCardHtml } from '../cards';
import { drillHeader, optionRow, tiles } from '../components';
import { icon } from '../icons';

const HANDS_PER_SESSION = 20;
const CORRECT_FLASH_MS = 450;

type View = 'setup' | 'hand' | 'wrong' | 'done';

interface Mistake {
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

const KEY_ACTIONS: Record<string, Action> = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' };

export function strategyScreen(): Screen {
  let view: View = 'setup';
  let session: Session | null = null;
  let wrong: WrongState | null = null;
  let flashing = false;
  let flashTimer: number | null = null;

  const rules = () => app.prefs.rules;

  function deal(filter: DrillFilter): { hand: DrillHand; advice: Advice } {
    const hand = dealDrillHand(filter, rules());
    return { hand, advice: bestPlay(hand.player, hand.upcard, rules()) };
  }

  function start() {
    const filter = app.prefs.filter;
    session = { filter, index: 0, correct: 0, streak: 0, bestStreak: 0, mistakes: [], ...deal(filter) };
    view = 'hand';
    app.render();
  }

  function header(s: Session) {
    const done = s.index + (view === 'hand' && !flashing ? 0 : 1);
    return drillHeader(`${DRILL_FILTER_LABEL[s.filter]} · Hand ${s.index + 1} of ${HANDS_PER_SESSION}`, done / HANDS_PER_SESSION, 'Back to strategy drill setup');
  }

  function setupView(): string {
    const filters = (Object.keys(DRILL_FILTER_LABEL) as DrillFilter[])
      .map((f) => optionRow('filter', f, DRILL_FILTER_LABEL[f], '', f === app.prefs.filter)).join('');
    return `<main class="screen">
      ${drillHeader('Strategy drill', undefined, 'Back to drills')}
      <section class="block">
        <h2 class="section-label">What to practise</h2>
        <div class="stack">${filters}</div>
      </section>
      <p class="small muted">${HANDS_PER_SESSION} hands. Answers come from the strategy engine for your table rules.</p>
      <div class="bottom"><button class="btn-primary" data-act="start">Start drill</button></div>
    </main>`;
  }

  function handView(s: Session): string {
    const allowed = availableActions(s.hand.player, rules());
    const btn = (a: Action, key: string) => {
      const ok = allowed.includes(a);
      return `<button class="btn-action" data-act="answer" data-value="${a}" aria-keyshortcuts="${key}"${ok && !flashing ? '' : ' disabled'}>${ACTION_LABEL[a]}</button>`;
    };
    const actions = flashing
      ? `<div class="flash" role="status">${icon.check(28)}<span>Correct</span></div>`
      : `<div class="action-grid">${btn('hit', 'H')}${btn('stand', 'S')}${btn('double', 'D')}${btn('split', 'P')}</div>
         ${rules().surrender === 'late' ? `<button class="btn-secondary" data-act="answer" data-value="surrender" aria-keyshortcuts="R"${allowed.includes('surrender') ? '' : ' disabled'}>Surrender</button>` : ''}`;
    return `<main class="screen drill">
      ${header(s)}
      <section class="table-area">
        <div class="area-label"><span class="section-label">Dealer shows ${pipName(s.advice.upcard)}</span></div>
        <div class="hand-row">${cardHtml(s.hand.upcard)}${hiddenCardHtml()}</div>
      </section>
      <section class="table-area">
        <div class="area-label"><span class="section-label">Your hand</span><span class="hand-type">${s.advice.handLabel}</span></div>
        <div class="hand-row">${s.hand.player.map((c) => cardHtml(c)).join('')}</div>
      </section>
      <div class="bottom actions${flashing ? ' is-flashing' : ''}">${actions}</div>
    </main>`;
  }

  function answer(action: Action) {
    const s = session;
    if (!s || view !== 'hand' || flashing) return;
    if (!availableActions(s.hand.player, rules()).includes(action)) return;
    if (action === s.advice.best) {
      s.correct++;
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      flashing = true;
      app.announce('Correct');
      app.render();
      flashTimer = window.setTimeout(() => {
        flashing = false;
        flashTimer = null;
        advance();
      }, CORRECT_FLASH_MS);
    } else {
      s.streak = 0;
      s.mistakes.push({ advice: s.advice, chosen: action });
      wrong = { chosen: action, quiz: followUp(s.advice, rules()), quizAnswer: null };
      view = 'wrong';
      app.announce(`Not quite. Best move: ${ACTION_LABEL[s.advice.best]}`);
      app.render();
    }
  }

  function advance() {
    const s = session!;
    wrong = null;
    if (s.index + 1 >= HANDS_PER_SESSION) {
      view = 'done';
    } else {
      s.index++;
      Object.assign(s, deal(s.filter));
      view = 'hand';
    }
    app.render();
  }

  function wrongView(s: Session, w: WrongState): string {
    const a = s.advice;
    const cost = mistakeCost(a, w.chosen);
    const evOf = (x: Action) => a.options.find((o) => o.action === x)!.ev;
    const pattern = samePattern(a, rules());
    let quiz = '';
    if (w.quiz) {
      const q = w.quiz;
      const buttons = q.options.map((o) => {
        let cls = 'pill';
        if (w.quizAnswer) {
          if (o === q.answer) cls += ' right';
          else if (o === w.quizAnswer) cls += ' wrong';
        }
        return `<button class="${cls}" data-act="quiz" data-value="${o}"${w.quizAnswer ? ' disabled' : ''}>${ACTION_LABEL[o]}</button>`;
      }).join('');
      const result = w.quizAnswer
        ? w.quizAnswer === q.answer
          ? `<p class="quiz-result ok">${icon.check(16)} Right: ${ACTION_LABEL[q.answer].toLowerCase()}.</p>`
          : `<p class="quiz-result bad">${icon.cross(16)} Not quite: ${ACTION_LABEL[q.answer].toLowerCase()}.</p>`
        : '';
      quiz = `<section class="quiz"><p>${q.question}</p><div class="pills">${buttons}</div>${result}</section>`;
    }
    return `<main class="screen drill">
      ${header(s)}
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
      ${drillHeader('Session done', undefined, 'Back to strategy drill setup')}
      ${tiles([['Accuracy', `${acc}%`], ['Correct', `${s.correct}/${HANDS_PER_SESSION}`], ['Best streak', String(s.bestStreak)]])}
      ${s.mistakes.length ? `<section class="block"><h2 class="section-label">Missed hands</h2><ul class="stack">${list}</ul></section>` : '<p>No mistakes this session.</p>'}
      <div class="bottom">
        <button class="btn-primary" data-act="start">Drill again</button>
        <button class="btn-secondary" data-act="back">Change drill</button>
      </div>
    </main>`;
  }

  return {
    render() {
      const s = session;
      if (view === 'hand' && s) return handView(s);
      if (view === 'wrong' && s && wrong) return wrongView(s, wrong);
      if (view === 'done' && s) return doneView(s);
      return setupView();
    },

    click(act, el) {
      const v = el.dataset.value;
      switch (act) {
        case 'back':
          if (view === 'setup') app.goHome();
          else { view = 'setup'; session = null; wrong = null; app.render(); }
          break;
        case 'filter': app.setPrefs({ filter: v as DrillFilter }); app.render(); break;
        case 'start': start(); break;
        case 'answer': answer(v as Action); break;
        case 'next': advance(); break;
        case 'show-cell': app.openChart(); break;
        case 'quiz':
          if (wrong && !wrong.quizAnswer) { wrong.quizAnswer = v as Action; app.render(); }
          break;
      }
    },

    key(e) {
      const k = e.key.toLowerCase();
      if (view === 'hand' && KEY_ACTIONS[k]) { answer(KEY_ACTIONS[k]); return true; }
      if (view === 'wrong' && k === 'enter' && document.activeElement === document.body) { advance(); return true; }
      return false;
    },

    chartFocus: () => (session && (view === 'hand' || view === 'wrong') ? session.advice : null),
    chartBlocked: () => flashing,

    leave() {
      if (flashTimer !== null) clearTimeout(flashTimer);
    },
  };
}
