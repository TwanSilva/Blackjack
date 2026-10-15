import {
  type Action, type ChartCode, ACTION_LABEL, adviseClass, buildChart, classLabel, dealHandFor, explain, parseCellKey,
  per100, pipName, recordDecision,
} from '../../engine';
import { type Screen, app } from '../app';
import { drillHeader } from '../components';
import { icon } from '../icons';

function codeClass(code: ChartCode): string {
  switch (code) {
    case 'S': return 'c-stand';
    case 'D': case 'Y': return 'c-double';
    case 'Ds': case 'Y/N': return 'c-teal';
    case 'SUR': return 'c-sur';
    case 'H': return 'c-hit';
    case 'N': return 'c-no';
    default: return 'c-empty';
  }
}

/** The basic strategy chart with every cell tappable for its reason, and a quiz mode that hides the answers. */
export function chartExplorerScreen(): Screen {
  let selected: string | null = null; // cell key "hard-13|5"
  let quiz = false;
  let answered: { action: Action; right: boolean } | null = null;
  const revealed = new Set<string>();
  let score = { right: 0, total: 0 };

  function detail(): string {
    if (!selected) return `<p class="small muted">${quiz ? 'Tap a cell, then pick the play.' : 'Tap a cell to see why.'}</p>`;
    const cell = parseCellKey(selected)!;
    const a = adviseClass(cell.cls, cell.upcard, app.prefs.rules);
    const head = `<strong>${classLabel(cell.cls)} vs ${pipName(cell.upcard)}</strong>`;
    if (quiz && !answered) {
      const btn = (x: Action) => `<button class="pill" data-act="guess" data-value="${x}">${ACTION_LABEL[x]}</button>`;
      return `<section class="feedback explorer-detail">${head}<div class="pills">${a.options.map((o) => o.action).sort().map(btn).join('')}</div></section>`;
    }
    const verdict = answered
      ? `<p class="quiz-result ${answered.right ? 'ok' : 'bad'}">${answered.right ? icon.check(16) : icon.cross(16)} ${answered.right ? 'Right' : `Not quite: you said ${ACTION_LABEL[answered.action].toLowerCase()}`}.</p>`
      : '';
    const evs = a.options.map((o) => `<li><span>${ACTION_LABEL[o.action]}</span><span class="${o.action === a.best ? 'good' : 'muted'}">${per100(o.ev)} per 100</span></li>`).join('');
    return `<section class="feedback explorer-detail ok">
      ${head}${verdict}
      <p>Best play: <strong class="good">${ACTION_LABEL[a.best]}</strong>. ${explain(a)}</p>
      <ul class="ev-list small">${evs}</ul>
    </section>`;
  }

  return {
    render() {
      const chart = buildChart(app.prefs.rules);
      const head = chart.upcards.map((u) => `<div class="chart-head" role="columnheader">${u === 1 ? 'A' : u}</div>`).join('');
      const sections = chart.sections.filter((s) => s.id !== 'surrender').map((s) => {
        const rows = s.rows.map((r) => `<div class="chart-row" role="row"><div class="chart-label" role="rowheader">${r.label}</div>${r.cells.map((c) => {
          const key = `${r.key}|${c.upcard}`;
          const hidden = quiz && !revealed.has(key);
          const ring = key === selected ? ' ring' : '';
          return `<button class="chart-cell heat ${hidden ? 'c-empty' : codeClass(c.code)}${ring}" data-act="cell" data-value="${key}" aria-label="${hidden ? `${classLabel(r.cls)} versus ${pipName(c.upcard)}: hidden` : c.label}">${hidden ? '?' : c.code}</button>`;
        }).join('')}</div>`).join('');
        return `<section class="chart-section"><h2 class="section-label">${s.title} · dealer upcard</h2>
          <div class="chart-grid" role="table" aria-label="${s.title}"><div class="chart-row" role="row"><div class="chart-label"></div>${head}</div>${rows}</div></section>`;
      }).join('');
      return `<main class="screen explorer">
        ${drillHeader('Chart explorer', undefined, 'Back')}
        <p class="small muted">${chart.rulesLine}</p>
        <div class="pills"><button class="pill${quiz ? '' : ' on'}" data-act="mode" data-value="show" aria-pressed="${!quiz}">Show the chart</button><button class="pill${quiz ? ' on' : ''}" data-act="mode" data-value="quiz" aria-pressed="${quiz}">Hide it and quiz me</button></div>
        ${quiz && score.total ? `<p class="small">${score.right} of ${score.total} right</p>` : ''}
        <div class="explorer-sticky" aria-live="polite">${detail()}</div>
        ${sections}
        <p class="small muted">Surrender cells are shown in the main chart (corner button). In quiz mode, answers count towards your stats.</p>
      </main>`;
    },
    click(act, el) {
      const v = el.dataset.value ?? '';
      if (act === 'back') app.goHome();
      else if (act === 'mode') { quiz = v === 'quiz'; selected = null; answered = null; revealed.clear(); score = { right: 0, total: 0 }; app.render(); }
      else if (act === 'cell') { selected = v; answered = quiz && revealed.has(v) ? answered : null; app.render(); }
      else if (act === 'guess' && selected) {
        const cell = parseCellKey(selected)!;
        const a = adviseClass(cell.cls, cell.upcard, app.prefs.rules);
        const action = v as Action;
        const hand = dealHandFor(cell, app.prefs.rules);
        recordDecision(app.progress, { advice: a, chosen: action, player: hand.player, upcard: hand.upcard, now: Date.now() });
        app.saveProgress();
        answered = { action, right: action === a.best };
        score = { right: score.right + (answered.right ? 1 : 0), total: score.total + 1 };
        revealed.add(selected);
        app.announce(answered.right ? 'Correct' : `Not quite. ${ACTION_LABEL[a.best]}`);
        app.render();
      }
    },
  };
}
