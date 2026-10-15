import { type StageId, pathState } from '../../engine';
import { type Screen, app } from '../app';
import { drillHeader, navRow } from '../components';
import { betDrillScreen } from './betDrill';
import { bettingScreen } from './betting';
import { chartExplorerScreen } from './chartExplorer';
import { countScreen } from './count';
import { countPlayScreen } from './countPlay';
import { statusLabel } from './learn';
import { lessonsScreen } from './lessons';
import { strategyScreen } from './strategy';
import { tableScreen } from './table';
import { trueCountScreen } from './trueCount';

/** The drills for each stage of the path. */
const STAGE_DRILLS: Record<StageId, { id: string; name: string; detail: string; open: () => Screen }[]> = {
  start: [
    { id: 'lessons', name: 'Lessons and quiz', detail: 'Hand values, soft and hard, actions, who wins', open: () => lessonsScreen() },
  ],
  chart: [
    { id: 'strategy', name: 'Strategy drill', detail: 'Hard totals, soft totals, pairs, weak spots', open: () => strategyScreen() },
    { id: 'explorer', name: 'Chart explorer', detail: 'Tap any cell for the why, or hide the chart and quiz yourself', open: () => chartExplorerScreen() },
  ],
  counting: [
    { id: 'count', name: 'Hi-Lo count drill', detail: 'Single cards, hands, a full table, the full deck test', open: () => countScreen() },
    { id: 'true', name: 'True count drill', detail: 'Divide by decks left, or read the discard tray', open: () => trueCountScreen() },
  ],
  playcount: [
    { id: 'countplay', name: 'Play the count', detail: 'The Illustrious 18, Fab 4 and insurance', open: () => countPlayScreen() },
  ],
  betting: [
    { id: 'bets', name: 'Bet sizing drill', detail: 'Bet from the true count with your spread', open: () => betDrillScreen() },
    { id: 'betting', name: 'Bet spread and bankroll', detail: 'Your spread, the edge at each count, the risk', open: () => bettingScreen() },
  ],
  casino: [
    { id: 'table', name: 'Table simulation', detail: 'Everything together, with pressure mode', open: () => tableScreen() },
  ],
};

export function stageScreen(id: StageId): Screen {
  return {
    render() {
      const s = pathState(app.progress, app.prefs.profile.startStage).find((x) => x.id === id)!;
      const acc = s.accuracy === null ? '–' : `${Math.round(s.accuracy * 100)}%`;
      const speed = s.speed === null ? null : id === 'counting' ? `${s.speed.toFixed(1)} s per card (fastest)` : `${s.speed.toFixed(1)} s per decision`;
      return `<main class="screen">
        ${drillHeader(s.name, undefined, 'Back to Learn')}
        <p>${s.covers}.</p>
        <div class="tiles">
          <div class="tile"><div class="tile-label">Status</div><div class="tile-value">${statusLabel(s)}</div></div>
          <div class="tile"><div class="tile-label">Accuracy</div><div class="tile-value">${acc}</div></div>
          <div class="tile"><div class="tile-label">Target</div><div class="tile-value small-value">${Math.round(s.progress * 100)}%</div></div>
        </div>
        <div class="progress" role="progressbar" aria-label="Progress to the target" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.progress * 100)}"><div style="width:${s.progress * 100}%"></div></div>
        <p class="small muted">Target: ${s.target}.${speed ? ` Speed: ${speed}.` : ''}</p>
        <section class="block"><h2 class="section-label">Drills</h2>
          <div class="stack">${STAGE_DRILLS[id].map((d) => navRow('open', d.id, d.name, d.detail)).join('')}</div>
        </section>
      </main>`;
    },
    click(act, el) {
      if (act === 'back') app.goHome();
      else if (act === 'open') app.go(STAGE_DRILLS[id].find((d) => d.id === el.dataset.value)!.open());
    },
  };
}
