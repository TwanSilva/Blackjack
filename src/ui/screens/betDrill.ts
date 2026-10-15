import {
  type BetDrillMode, type BetFeedback, type BetQuestion, describeSpread, gradeBetQuestion, makeBetQuestion,
  recordBet, recordSession, signed,
} from '../../engine';
import { type Screen, app } from '../app';
import { drillHeader, optionRow, tiles } from '../components';
import { icon } from '../icons';
import { bettingScreen } from './betting';

const QUESTIONS = 20;
const CORRECT_FLASH_MS = 500;

type Phase = 'setup' | 'question' | 'wrong' | 'done';

export interface BetDrillOptions {
  autostart?: boolean;
}

export function betDrillScreen(opts: BetDrillOptions = {}): Screen {
  let phase: Phase = 'setup';
  let mode: BetDrillMode = 'shown';
  let q: BetQuestion | null = null;
  let fb: BetFeedback | null = null;
  let index = 0;
  let correct = 0;
  let over = 0;
  let under = 0;
  let flashing = false;
  let flashTimer: number | null = null;
  let startedAt = 0;

  const unit = () => app.prefs.unitPotatoes;

  function ask() {
    q = makeBetQuestion(app.prefs.spread, app.prefs.rules, app.prefs.tcRounding, mode);
    fb = null;
    phase = 'question';
    app.render();
  }

  function start() {
    index = 0; correct = 0; over = 0; under = 0;
    startedAt = Date.now();
    ask();
  }

  function answer(units: number) {
    if (!q || phase !== 'question' || flashing) return;
    fb = gradeBetQuestion(q, app.prefs.spread, app.prefs.rules, app.prefs.tcRounding, units, unit());
    recordBet(app.progress, fb.verdict);
    app.saveProgress();
    if (fb.verdict === 'right') {
      correct++;
      flashing = true;
      app.announce('Correct');
      app.render();
      flashTimer = window.setTimeout(() => { flashing = false; flashTimer = null; advance(); }, CORRECT_FLASH_MS);
    } else {
      if (fb.verdict === 'over') over++; else under++;
      phase = 'wrong';
      app.render();
    }
  }

  function advance() {
    if (index + 1 >= QUESTIONS) {
      recordSession(app.progress, {
        at: Date.now(), kind: 'bet', label: mode === 'shown' ? 'True count shown' : 'Work out the true count',
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

  function countBlock(question: BetQuestion): string {
    if (question.running !== undefined) {
      return `<div class="givens">
        <div class="given"><span class="section-label">Running count</span><span class="given-value">${signed(question.running)}</span></div>
        <div class="given"><span class="section-label">Decks left</span><span class="given-value">${question.decksLeft}</span></div>
      </div>`;
    }
    return `<div class="given count-given"><span class="section-label">True count</span><span class="given-value">${signed(question.trueCount)}</span></div>`;
  }

  function betButtons(question: BetQuestion): string {
    return `<div class="bet-grid">${question.levels.map((u, i) =>
      `<button class="btn-action bet-btn" data-act="bet" data-value="${u}" aria-keyshortcuts="${i + 1}"${flashing ? ' disabled' : ''}>
        <span>${u} unit${u === 1 ? '' : 's'}</span><span class="small">${u * unit()} potatoes</span></button>`).join('')}</div>`;
  }

  function questionView(): string {
    const question = q!;
    const header = drillHeader(`Bet sizing · Count ${index + 1} of ${QUESTIONS}`, (index + (flashing ? 1 : 0)) / QUESTIONS, 'Back to bet sizing setup');
    const bottom = flashing ? `<div class="flash" role="status">${icon.check(28)}<span>Correct</span></div>` : betButtons(question);
    return `<main class="screen drill">
      ${header}
      ${countBlock(question)}
      <p class="small muted center-text">New round. What do you bet?</p>
      <div class="bottom">${bottom}</div>
    </main>`;
  }

  function wrongView(): string {
    const f = fb!;
    return `<main class="screen drill">
      ${drillHeader(`Bet sizing · Count ${index + 1} of ${QUESTIONS}`, (index + 1) / QUESTIONS, 'Back to bet sizing setup')}
      ${countBlock(q!)}
      <section class="feedback">
        <div class="feedback-head"><span class="bad-icon">${icon.cross(18)}</span><div><strong>${f.verdict === 'over' ? 'Over-betting' : 'Under-betting'}</strong></div></div>
        <div class="moves">
          <div><div class="section-label">Your bet</div><div class="move">${f.chosenUnits} unit${f.chosenUnits === 1 ? '' : 's'}</div></div>
          <div><div class="section-label">Your spread</div><div class="move good">${f.expectedUnits} unit${f.expectedUnits === 1 ? '' : 's'}</div></div>
        </div>
        <div><div class="section-label">Why</div><p>${f.countSum ? `${f.countSum} ` : ''}${f.explanation}</p><p class="small muted">${f.edgeNote}</p></div>
      </section>
      <div class="bottom"><button class="btn-primary" data-act="next">${index + 1 >= QUESTIONS ? 'See results' : 'Next count'}</button></div>
    </main>`;
  }

  function doneView(): string {
    return `<main class="screen">
      ${drillHeader('Bet sizing: results', undefined, 'Back to bet sizing setup')}
      ${tiles([['Right', `${correct}/${QUESTIONS}`], ['Over', String(over)], ['Under', String(under)]])}
      <div class="bottom">
        <button class="btn-primary" data-act="start">Again</button>
        <button class="btn-secondary" data-act="back">Change drill</button>
      </div>
    </main>`;
  }

  function setupView(): string {
    const modes = [
      optionRow('mode', 'shown', 'True count shown', 'Learn your spread', mode === 'shown'),
      optionRow('mode', 'hidden', 'Work out the true count', 'Running count and decks left, then bet', mode === 'hidden'),
    ].join('');
    return `<main class="screen">
      ${drillHeader('Bet sizing drill', undefined, 'Back to drills')}
      <p class="small muted">Your spread: ${describeSpread(app.prefs.spread)} One unit is ${unit()} potatoes.</p>
      <button class="btn-text left" data-act="spread">Change the spread</button>
      <section class="block"><h2 class="section-label">Mode</h2><div class="stack">${modes}</div></section>
      <div class="bottom"><button class="btn-primary" data-act="start">Start · ${QUESTIONS} counts</button></div>
    </main>`;
  }

  if (opts.autostart) queueMicrotask(() => start());

  return {
    render() {
      if (phase === 'question' && q) return questionView();
      if (phase === 'wrong' && q && fb) return wrongView();
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
        case 'mode': mode = v as BetDrillMode; app.render(); break;
        case 'spread': app.go(bettingScreen()); break;
        case 'start': start(); break;
        case 'bet': answer(Number(v)); break;
        case 'next': advance(); break;
      }
    },
    key(e) {
      if (phase === 'question' && q && /^[1-9]$/.test(e.key)) {
        const u = q.levels[Number(e.key) - 1];
        if (u !== undefined) { answer(u); return true; }
      }
      if (phase === 'wrong' && e.key === 'Enter') { advance(); return true; }
      return false;
    },
    chartBlocked: () => flashing,
    leave() { if (flashTimer !== null) clearTimeout(flashTimer); },
  };
}
