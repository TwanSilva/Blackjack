import { type LessonId, type LessonQuestion, LESSONS, makeLessonQuestion, recordLesson, recordSession } from '../../engine';
import { type Screen, app } from '../app';
import { cardHtml } from '../cards';
import { drillHeader, navRow, tiles } from '../components';
import { icon } from '../icons';

const QUESTIONS_PER_LESSON = 8;

type Phase = 'menu' | 'read' | 'quiz' | 'done';

export function lessonsScreen(): Screen {
  let phase: Phase = 'menu';
  let lesson: LessonId = 'values';
  let q: LessonQuestion | null = null;
  let chosen: string | null = null;
  let index = 0;
  let correct = 0;
  let startedAt = 0;

  const info = () => LESSONS.find((l) => l.id === lesson)!;

  function ask() {
    q = makeLessonQuestion(lesson, app.prefs.rules);
    chosen = null;
    phase = 'quiz';
    app.render();
  }

  function answer(v: string) {
    if (!q || chosen) return;
    chosen = v;
    const right = v === q.answer;
    if (right) correct++;
    recordLesson(app.progress, right);
    app.saveProgress();
    app.announce(right ? 'Correct' : `Not quite. ${q.answer}`);
    app.render();
  }

  function next() {
    if (index + 1 >= QUESTIONS_PER_LESSON) {
      recordSession(app.progress, { at: Date.now(), kind: 'lesson', label: `Lesson: ${info().title}`, total: QUESTIONS_PER_LESSON, correct, durationMs: Date.now() - startedAt });
      app.saveProgress();
      phase = 'done';
      app.render();
      return;
    }
    index++;
    ask();
  }

  function menuView(): string {
    const t = app.progress.lessons;
    return `<main class="screen">
      ${drillHeader('Start here', undefined, 'Back')}
      <p class="small muted">Four short lessons, each with a quick quiz. Answers are worked out by the game engine for your table's rules.${t.attempts ? ` So far: ${t.correct} of ${t.attempts} right.` : ''}</p>
      <div class="stack">${LESSONS.map((l, i) => navRow('lesson', l.id, `${i + 1}. ${l.title}`, `${QUESTIONS_PER_LESSON} questions`)).join('')}</div>
    </main>`;
  }

  function readView(): string {
    const l = info();
    return `<main class="screen">
      ${drillHeader(l.title, undefined, 'Back to lessons')}
      <section class="lesson">${l.body(app.prefs.rules).map((p) => `<p>${p}</p>`).join('')}</section>
      <div class="bottom"><button class="btn-primary" data-act="quiz">Quiz me · ${QUESTIONS_PER_LESSON} questions</button></div>
    </main>`;
  }

  function quizView(): string {
    const question = q!;
    const opts = question.options.map((o) => {
      let cls = 'pill';
      if (chosen) { if (o === question.answer) cls += ' right'; else if (o === chosen) cls += ' wrong'; }
      return `<button class="${cls}" data-act="answer" data-value="${o}"${chosen ? ' disabled' : ''}>${o}</button>`;
    }).join('');
    const cards = (list: typeof question.player, label: string) => list.length
      ? `<section class="table-area"><div class="area-label"><span class="section-label">${label}</span></div><div class="hand-row">${list.map((c) => cardHtml(c)).join('')}</div></section>` : '';
    const result = chosen
      ? `<p class="quiz-result ${chosen === question.answer ? 'ok' : 'bad'}">${chosen === question.answer ? icon.check(16) : icon.cross(16)} ${chosen === question.answer ? 'Right.' : `Not quite: ${question.answer}.`}</p><p class="small">${question.explain}</p>`
      : '';
    return `<main class="screen drill">
      ${drillHeader(`${info().title} · ${index + 1} of ${QUESTIONS_PER_LESSON}`, (index + (chosen ? 1 : 0)) / QUESTIONS_PER_LESSON, 'Back to lessons')}
      ${question.dealer ? cards(question.dealer, 'Dealer ends with') : ''}
      ${cards(question.player, question.dealer ? 'Your hand' : 'Hand')}
      <p class="lesson-prompt">${question.prompt}</p>
      <div class="pills lesson-options">${opts}</div>
      ${result}
      <div class="bottom">${chosen ? `<button class="btn-primary" data-act="next">${index + 1 >= QUESTIONS_PER_LESSON ? 'Finish' : 'Next'}</button>` : ''}</div>
    </main>`;
  }

  function doneView(): string {
    const nextLesson = LESSONS[LESSONS.findIndex((l) => l.id === lesson) + 1];
    return `<main class="screen">
      ${drillHeader(`${info().title}: done`, undefined, 'Back to lessons')}
      ${tiles([['Right', `${correct}/${QUESTIONS_PER_LESSON}`], ['All lessons', `${app.progress.lessons.correct}/${app.progress.lessons.attempts}`]])}
      <div class="bottom">
        ${nextLesson ? `<button class="btn-primary" data-act="lesson" data-value="${nextLesson.id}">Next: ${nextLesson.title}</button>` : '<p>That was the last lesson. The chart is next on your path.</p>'}
        <button class="btn-secondary" data-act="menu">All lessons</button>
      </div>
    </main>`;
  }

  return {
    render() {
      if (phase === 'read') return readView();
      if (phase === 'quiz' && q) return quizView();
      if (phase === 'done') return doneView();
      return menuView();
    },
    click(act, el) {
      const v = el.dataset.value ?? '';
      switch (act) {
        case 'back': if (phase === 'menu') app.goHome(); else { phase = 'menu'; app.render(); } break;
        case 'menu': phase = 'menu'; app.render(); break;
        case 'lesson': lesson = v as LessonId; phase = 'read'; app.render(); break;
        case 'quiz': index = 0; correct = 0; startedAt = Date.now(); ask(); break;
        case 'answer': answer(v); break;
        case 'next': next(); break;
      }
    },
    key(e) {
      if (phase === 'quiz' && q && !chosen && /^[1-9]$/.test(e.key)) {
        const o = q.options[Number(e.key) - 1];
        if (o) { answer(o); return true; }
      }
      if (phase === 'quiz' && chosen && e.key === 'Enter') { next(); return true; }
      return false;
    },
  };
}
