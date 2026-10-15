import {
  type StageState, INSURANCE_DEVIATION, accuracy, currentStage, indexMismatch, pathState, potatoesNet, rulesSummary, strategyTotals,
  todaysPractice,
} from '../../engine';
import { type Screen, app } from '../app';
import { tabBar, tiles } from '../components';
import { icon } from '../icons';
import { betDrillScreen } from './betDrill';
import { countScreen } from './count';
import { countPlayScreen } from './countPlay';
import { stageScreen } from './stage';
import { strategyScreen } from './strategy';
import { tableScreen } from './table';
import { trueCountScreen } from './trueCount';

export function statusLabel(s: StageState): string {
  switch (s.status) {
    case 'mastered': return 'Mastered';
    case 'in-progress': return `${Math.max(1, Math.round(s.progress * 100))}%`;
    case 'up-next': return 'Up next';
    case 'skipped': return 'Skipped';
    default: return 'Locked';
  }
}

/** Starts Today's practice. Shared by the Learn and Drill tabs. */
export function startPractice(): void {
  const countPlayOk = !indexMismatch(INSURANCE_DEVIATION.source, app.prefs.tcRounding, app.prefs.rules);
  const pr = todaysPractice(app.progress, countPlayOk);
  if (pr.kind === 'strategy') app.go(strategyScreen({ filter: pr.filter, hands: pr.size, autostart: true }));
  else if (pr.kind === 'count') app.go(countScreen({ variant: pr.countVariant, autostart: true }));
  else if (pr.kind === 'deviation') app.go(countPlayScreen({ autostart: true }));
  else if (pr.kind === 'bet') app.go(betDrillScreen({ autostart: true }));
  else if (pr.kind === 'table') app.go(tableScreen());
  else app.go(trueCountScreen({ source: pr.tcSource, autostart: true }));
}

/** Home (UI Blackjack.md 3.1). */
export function learnScreen(): Screen {
  return {
    render() {
      const p = app.progress;
      const totals = strategyTotals(p);
      const acc = accuracy(totals);
      const pot = potatoesNet(p);
      const countPlayOk = !indexMismatch(INSURANCE_DEVIATION.source, app.prefs.tcRounding, app.prefs.rules);
      const practice = todaysPractice(p, countPlayOk);
      const stages = pathState(p, app.prefs.profile.startStage);
      const current = currentStage(p, app.prefs.profile.startStage);
      const rows = stages.map((s) => {
        const cls = s.id === current?.id ? ' current' : s.status === 'locked' ? ' locked' : '';
        const right = s.status === 'mastered' ? `<span class="good">${icon.check(16)} ${statusLabel(s)}</span>` : `<span class="muted">${statusLabel(s)}</span>`;
        return `<button class="path-row${cls}" data-act="stage" data-value="${s.id}" aria-label="${s.name}: ${statusLabel(s)}"><span>${s.name}</span>${right}</button>`;
      }).join('');
      return `<main class="screen with-tabs">
        <header class="home-top">
          <h1 class="title">Learn</h1>
          <div class="home-top-right"><span class="small muted">${rulesSummary(app.prefs.rules)}</span>${app.chartButton()}</div>
        </header>
        ${tiles([
          ['Streak', String(p.streak.current)],
          ['Accuracy', acc === null ? '–' : `${Math.round(acc * 100)}%`],
          ['Potatoes', `${pot > 0 ? '+' : pot < 0 ? '−' : ''}${Math.abs(pot).toLocaleString('en')}`],
        ])}
        <section class="practice">
          <h2 class="section-label">Today's practice</h2>
          <p class="practice-title">${practice.title}</p>
          <p class="small muted">${practice.detail}</p>
          <button class="btn-primary" data-act="practice">Start drill</button>
        </section>
        <section class="block">
          <h2 class="section-label">Your path</h2>
          <div class="stack">${rows}</div>
          <p class="small muted">Each stage unlocks the next when you hit its target. You can open any stage at any time.</p>
        </section>
        ${tabBar('learn')}
      </main>`;
    },
    click(act, el) {
      if (act === 'practice') startPractice();
      else if (act === 'stage') app.go(stageScreen(el.dataset.value as StageState['id']));
    },
  };
}
