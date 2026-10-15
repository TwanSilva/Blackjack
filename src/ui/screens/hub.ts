import {
  COUNT_VARIANTS, DRILL_FILTER_LABEL, INSURANCE_DEVIATION, TRUE_COUNT_SOURCES, describeSpread, indexMismatch,
  rulesSummary,
} from '../../engine';
import { type Screen, app } from '../app';
import { navRow, tabBar } from '../components';
import { betDrillScreen } from './betDrill';
import { bettingScreen } from './betting';
import { chartExplorerScreen } from './chartExplorer';
import { countScreen } from './count';
import { countPlayScreen } from './countPlay';
import { lessonsScreen } from './lessons';
import { strategyScreen } from './strategy';
import { tableScreen } from './table';
import { trueCountScreen } from './trueCount';

const SCREENS: Record<string, () => Screen> = {
  lessons: lessonsScreen, strategy: () => strategyScreen(), explorer: chartExplorerScreen, count: () => countScreen(),
  true: () => trueCountScreen(), countplay: () => countPlayScreen(), bets: () => betDrillScreen(), betting: bettingScreen,
  table: () => tableScreen(),
};

/** The Drill tab: every drill in path order. Table rules live in Settings. */
export function hubScreen(): Screen {
  return {
    render() {
      const r = app.prefs.rules;
      const variant = COUNT_VARIANTS.find((v) => v.id === app.prefs.countVariant)!;
      const source = TRUE_COUNT_SOURCES.find((s) => s.id === app.prefs.tcSource)!;
      const countPlayOk = !indexMismatch(INSURANCE_DEVIATION.source, app.prefs.tcRounding, r);
      return `<main class="screen with-tabs">
        <header class="home-top">
          <h1 class="title">Drill</h1>
          <div class="home-top-right"><span class="small muted">${rulesSummary(r)}</span>${app.chartButton()}</div>
        </header>
        <section class="block"><h2 class="section-label">Basics</h2><div class="stack">
          ${navRow('open', 'lessons', 'Start here', 'Hand values, soft and hard, actions, who wins')}
          ${navRow('open', 'strategy', 'Strategy drill', DRILL_FILTER_LABEL[app.prefs.filter])}
          ${navRow('open', 'explorer', 'Chart explorer', 'Tap any cell for the why, or quiz yourself')}
        </div></section>
        <section class="block"><h2 class="section-label">Counting</h2><div class="stack">
          ${navRow('open', 'count', 'Hi-Lo count drill', `${variant.name} · ${app.prefs.countMode === 'learn' && variant.learnable ? 'learning' : 'test'}`)}
          ${navRow('open', 'true', 'True count drill', source.name)}
          ${navRow('open', 'countplay', 'Play the count', countPlayOk ? 'Illustrious 18, Fab 4 and insurance' : 'Indices don’t fit these rules')}
        </div></section>
        <section class="block"><h2 class="section-label">Betting and the table</h2><div class="stack">
          ${navRow('open', 'bets', 'Bet sizing drill', 'Bet from the true count with your spread')}
          ${navRow('open', 'betting', 'Bet spread and bankroll', `${describeSpread(app.prefs.spread)} 1 unit = ${app.prefs.unitPotatoes} potatoes.`)}
          ${navRow('open', 'table', 'Table simulation', 'Everything together, with potatoes')}
        </div></section>
        <p class="small muted">Table rules, rounding and display options are in Settings.</p>
        ${tabBar('drill')}
      </main>`;
    },
    click(act, el) {
      if (act === 'open') app.go(SCREENS[el.dataset.value!]());
    },
  };
}
