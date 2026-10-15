import {
  type TrueCountGrade, type TrueCountQuestion, type TrueCountRounding, type TrueCountSource, ROUNDING_DESCRIPTION,
  ROUNDING_LABEL, TRUE_COUNT_SOURCES, deckChoices, gradeTrueCount, makeTrueCountQuestion, recordSession,
  recordTrueCount, signed,
} from '../../engine';
import { type Screen, app } from '../app';
import { drillHeader, numpadHtml, numpadInput, numpadKey, optionRow, parseEntry, pills, tiles } from '../components';
import { icon } from '../icons';
import { trayHtml } from '../tray';

const QUESTIONS = 10;
const CORRECT_FLASH_MS = 700;

type Phase = 'setup' | 'question' | 'wrong' | 'done';

function decksLabel(d: number): string {
  return Number.isInteger(d) ? String(d) : d.toFixed(1);
}

export interface TrueCountOptions {
  source?: TrueCountSource;
  autostart?: boolean;
}

export function trueCountScreen(opts: TrueCountOptions = {}): Screen {
  if (opts.source) app.setPrefs({ tcSource: opts.source });
  if (opts.autostart) queueMicrotask(() => start());
  let startedAt = 0;
  let phase: Phase = 'setup';
  let q: TrueCountQuestion | null = null;
  let index = 0;
  let correct = 0;
  let entry = '';
  let deckEstimate: number | undefined;
  let grade: TrueCountGrade | null = null;
  let flashing = false;
  let flashTimer: number | null = null;

  function ask() {
    q = makeTrueCountQuestion(app.prefs.tcSource, app.prefs.rules, app.prefs.tcRounding);
    entry = '';
    deckEstimate = undefined;
    grade = null;
    phase = 'question';
    app.render();
  }

  function start() {
    startedAt = Date.now();
    index = 0;
    correct = 0;
    ask();
  }

  function submit() {
    const n = parseEntry(entry);
    if (!q || n === null || flashing) return;
    if (q.source === 'tray' && deckEstimate === undefined) return;
    grade = gradeTrueCount(q, n, deckEstimate);
    recordTrueCount(app.progress, q.source, grade.correct);
    app.saveProgress();
    if (grade.correct) {
      correct++;
      flashing = true;
      app.announce('Correct');
      app.render();
      flashTimer = window.setTimeout(() => { flashing = false; flashTimer = null; advance(); }, CORRECT_FLASH_MS);
    } else {
      phase = 'wrong';
      app.announce('Not quite');
      app.render();
    }
  }

  function advance() {
    if (index + 1 >= QUESTIONS) {
      const source = TRUE_COUNT_SOURCES.find((x) => x.id === q!.source)!;
      recordSession(app.progress, {
        at: Date.now(), kind: 'true', label: source.name, total: QUESTIONS, correct, durationMs: Date.now() - startedAt,
      });
      app.saveProgress();
      phase = 'done';
      app.render();
      return;
    }
    index++;
    ask();
  }

  function givenBlock(question: TrueCountQuestion): string {
    if (question.source === 'decks') {
      return `<div class="given"><span class="section-label">Decks remaining</span><span class="given-value">${decksLabel(question.decksForAnswer)}</span></div>`;
    }
    if (question.source === 'cards') {
      return `<div class="given"><span class="section-label">Cards remaining</span><span class="given-value">${question.cardsRemaining}</span></div>`;
    }
    return '';
  }

  function questionView(): string {
    const question = q!;
    const header = drillHeader(`True count · Question ${index + 1} of ${QUESTIONS}`, (index + (flashing ? 1 : 0)) / QUESTIONS, 'Back to true count setup');
    const rc = `<div class="given"><span class="section-label">Running count</span><span class="given-value">${signed(question.running)}</span></div>`;
    let body: string;
    if (question.source === 'tray') {
      const choices = deckChoices(question.shoeDecks).map((d) => ({ value: String(d), label: decksLabel(d), on: d === deckEstimate }));
      body = `<div class="givens">${rc}<div class="given"><span class="section-label">Shoe</span><span class="given-value">${question.shoeDecks}</span><span class="small muted">decks</span></div></div>
        ${trayHtml(question.cardsDiscarded, question.shoeDecks)}
        <section class="block"><h2 class="section-label">1. Decks remaining in the shoe</h2>${pills('deck', choices, 'Decks remaining').replace('class="pills"', 'class="pills deck-grid"')}</section>`;
    } else {
      body = `<div class="givens">${rc}${givenBlock(question)}</div>`;
    }
    const pad = question.source !== 'tray' || deckEstimate !== undefined
      ? numpadHtml(entry, question.source === 'tray' ? '2. True count' : 'True count')
      : '<p class="small muted">Pick the decks remaining first.</p>';
    const bottom = flashing
      ? `<div class="flash" role="status">${icon.check(28)}<span>Correct</span></div>`
      : pad;
    return `<main class="screen drill">
      ${header}
      ${body}
      <p class="small muted">${ROUNDING_LABEL[question.rounding]}: ${ROUNDING_DESCRIPTION[question.rounding]}</p>
      <div class="bottom">${bottom}</div>
    </main>`;
  }

  function wrongView(): string {
    const g = grade!;
    const deckLine = g.deckEstimateOk === false
      ? `<p>Your estimate of ${decksLabel(deckEstimate!)} decks is more than half a deck off.</p>`
      : '';
    return `<main class="screen drill">
      ${drillHeader(`True count · Question ${index + 1} of ${QUESTIONS}`, (index + 1) / QUESTIONS, 'Back to true count setup')}
      <section class="feedback">
        <div class="feedback-head"><span class="bad-icon">${icon.cross(18)}</span><div><strong>Not quite</strong></div></div>
        <div class="moves">
          <div><div class="section-label">Your answer</div><div class="move">${signed(parseEntry(entry) ?? 0)}</div></div>
          <div><div class="section-label">True count</div><div class="move good">${signed(g.expected)}</div></div>
        </div>
        ${deckLine}
        <div><div class="section-label">How</div><p>${g.explanation}</p></div>
      </section>
      <div class="bottom"><button class="btn-primary" data-act="next">${index + 1 >= QUESTIONS ? 'See results' : 'Next question'}</button></div>
    </main>`;
  }

  function doneView(): string {
    return `<main class="screen">
      ${drillHeader('True count results', undefined, 'Back to true count setup')}
      ${tiles([['Accuracy', `${Math.round((correct / QUESTIONS) * 100)}%`], ['Correct', `${correct}/${QUESTIONS}`]])}
      <div class="bottom">
        <button class="btn-primary" data-act="start">Again</button>
        <button class="btn-secondary" data-act="back">Change drill</button>
      </div>
    </main>`;
  }

  function setupView(): string {
    const sources = TRUE_COUNT_SOURCES.map((s) => optionRow('source', s.id, s.name, s.detail, s.id === app.prefs.tcSource)).join('');
    const r = app.prefs.tcRounding;
    const rounding = pills('rounding', (Object.keys(ROUNDING_LABEL) as TrueCountRounding[]).map((k) => ({ value: k, label: ROUNDING_LABEL[k], on: k === r })), 'Rounding');
    return `<main class="screen">
      ${drillHeader('True count drill', undefined, 'Back to drills')}
      <p class="small muted">True count = running count ÷ decks remaining. Positions come from a real ${app.prefs.rules.decks}-deck shoe dealt to a random point before the cut card.</p>
      <section class="block"><h2 class="section-label">Question type</h2><div class="stack">${sources}</div></section>
      <section class="block"><h2 class="section-label">Rounding</h2>${rounding}<p class="small muted">${ROUNDING_DESCRIPTION[r]}</p></section>
      <div class="bottom"><button class="btn-primary" data-act="start">Start · ${QUESTIONS} questions</button></div>
    </main>`;
  }

  return {
    render() {
      if (phase === 'question' && q) return questionView();
      if (phase === 'wrong' && q && grade) return wrongView();
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
        case 'source': app.setPrefs({ tcSource: v as TrueCountSource }); app.render(); break;
        case 'rounding': app.setPrefs({ tcRounding: v as TrueCountRounding }); app.render(); break;
        case 'start': start(); break;
        case 'deck': deckEstimate = Number(v); app.render(); break;
        case 'np-submit': submit(); break;
        case 'next': advance(); break;
        default: {
          if (flashing) return;
          const nextEntry = numpadInput(entry, act, v);
          if (nextEntry !== null) { entry = nextEntry; app.render(); }
        }
      }
    },

    key(e) {
      if (phase === 'question' && !flashing && (q?.source !== 'tray' || deckEstimate !== undefined)) {
        if (e.key === 'Enter') { submit(); return true; }
        const nextEntry = numpadKey(entry, e);
        if (nextEntry !== null) { entry = nextEntry; app.render(); return true; }
      }
      if (phase === 'wrong' && e.key === 'Enter') { advance(); return true; }
      return false;
    },

    chartBlocked: () => flashing,

    leave() {
      if (flashTimer !== null) clearTimeout(flashTimer);
    },
  };
}
