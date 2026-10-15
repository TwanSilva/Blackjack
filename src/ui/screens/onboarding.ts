import {
  type OnboardingAnswers, type OnboardingResult, ONBOARDING_QUESTIONS, INTERSTITIALS, STAGES, onboardingResult,
} from '../../engine';
import { type Screen, app } from '../app';
import { drillHeader, optionRow } from '../components';
import type { BankrollSize } from '../storage';

type Step = { kind: 'question'; index: number } | { kind: 'why'; index: number } | { kind: 'result' };

/** One question per screen, a back button and a progress bar; every question can be skipped. */
export function onboardingScreen(): Screen {
  let step: Step = { kind: 'question', index: 0 };
  const answers: OnboardingAnswers = structuredClone(app.prefs.profile.answers);
  let result: OnboardingResult | null = null;

  const total = ONBOARDING_QUESTIONS.length;

  function forward() {
    if (step.kind === 'question') {
      const q = ONBOARDING_QUESTIONS[step.index];
      if (INTERSTITIALS[q.id]) step = { kind: 'why', index: step.index };
      else if (step.index + 1 < total) step = { kind: 'question', index: step.index + 1 };
      else finish();
    } else if (step.kind === 'why') {
      step = step.index + 1 < total ? { kind: 'question', index: step.index + 1 } : { kind: 'result' };
      if (step.kind === 'result') finish();
    }
    app.render();
  }

  function backward() {
    if (step.kind === 'question' && step.index === 0) {
      // Leaving at the first question skips the setup: start at the beginning, keep any answers.
      if (!app.prefs.profile.onboarded) app.setPrefs({ profile: { onboarded: true, answers, startStage: 'start' } });
      app.goHome();
      return;
    }
    if (step.kind === 'why') step = { kind: 'question', index: step.index };
    else if (step.kind === 'question') {
      const prev = step.index - 1;
      step = INTERSTITIALS[ONBOARDING_QUESTIONS[prev].id] ? { kind: 'why', index: prev } : { kind: 'question', index: prev };
    } else step = { kind: 'question', index: total - 1 };
    app.render();
  }

  function finish() {
    result = onboardingResult(answers);
    step = { kind: 'result' };
  }

  function done() {
    const r = result!;
    app.setPrefs({
      profile: { onboarded: true, answers, startStage: r.startStage },
      filter: r.filter,
      bankrollSize: r.bankroll as BankrollSize,
    });
    app.goHome();
  }

  function questionView(index: number): string {
    const q = ONBOARDING_QUESTIONS[index];
    const chosen = answers[q.id] ?? [];
    const rows = q.options.map((o) => optionRow('choose', o.id, o.label, '', chosen.includes(o.id))).join('');
    return `<main class="screen">
      ${drillHeader(`Question ${index + 1} of ${total}`, (index + 1) / total, index === 0 ? 'Back' : 'Previous question')}
      <h1 class="title onboarding-title">${q.title}</h1>
      ${q.multi ? '<p class="small muted">Pick all that apply.</p>' : ''}
      ${q.note ? `<p class="small muted">${q.note}</p>` : ''}
      <div class="stack" role="group" aria-label="${q.title}">${rows}</div>
      <div class="bottom">
        <button class="btn-primary" data-act="continue">${chosen.length ? 'Continue' : 'Skip'}</button>
      </div>
    </main>`;
  }

  function whyView(index: number): string {
    const w = INTERSTITIALS[ONBOARDING_QUESTIONS[index].id]!;
    return `<main class="screen">
      ${drillHeader('Why this matters', (index + 1) / total, 'Previous question')}
      <section class="why"><div class="why-mark" aria-hidden="true"></div><h1 class="title">${w.title}</h1><p>${w.body}</p></section>
      <div class="bottom"><button class="btn-primary" data-act="continue">Continue</button></div>
    </main>`;
  }

  function resultView(): string {
    const r = result!;
    const stage = STAGES.find((s) => s.id === r.startStage)!;
    return `<main class="screen">
      ${drillHeader('Here’s where you start', 1, 'Previous question')}
      <section class="practice"><h2 class="section-label">Starting stage</h2><p class="practice-title">${stage.name}</p><p class="small muted">${stage.covers}</p></section>
      <section class="block">${r.reasons.map((x) => `<p>${x}</p>`).join('')}</section>
      <section class="block"><h2 class="section-label">Your path</h2>
        <ol class="stack plan">${r.path.map((p) => { const s = STAGES.find((x) => x.id === p.stage)!; return `<li class="path-row static"><span>${s.name}</span><span class="small muted">${p.focus}</span></li>`; }).join('')}</ol>
      </section>
      <p class="small muted">You can change any of this later in Settings, and open any stage at any time.</p>
      <div class="bottom"><button class="btn-primary" data-act="done">Start</button></div>
    </main>`;
  }

  return {
    render() {
      if (step.kind === 'why') return whyView(step.index);
      if (step.kind === 'result' && result) return resultView();
      return questionView(step.kind === 'question' ? step.index : 0);
    },
    click(act, el) {
      if (act === 'back') backward();
      else if (act === 'continue') forward();
      else if (act === 'done') done();
      else if (act === 'choose' && step.kind === 'question') {
        const q = ONBOARDING_QUESTIONS[step.index];
        const id = el.dataset.value!;
        const cur = answers[q.id] ?? [];
        if (q.multi) {
          // "None yet" excludes the rest.
          let next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
          if (id === 'none' && next.includes('none')) next = ['none'];
          else next = next.filter((x) => x !== 'none');
          answers[q.id] = next;
          app.render();
        } else {
          answers[q.id] = [id];
          forward();
        }
      }
    },
  };
}
