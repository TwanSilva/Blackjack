import {
  type CellBand, type HandClass, ACTION_LABEL, BAND_LABEL, DEVIATIONS, HARD_TOTALS, PAIR_PIPS, SOFT_TOTALS,
  TRUE_COUNT_SOURCES, UPCARDS, accuracy, adviseClass, avgDecisionSeconds, bestDeckTime, cellBand, cellKey, cellsSeen,
  classLabel, hardClass, mistakesToReplay, pairClass, parseCellKey, parseProgress, pipName, rowLabel, softClass, strategyTotals,
  totalCells, weakCells,
} from '../../engine';
import { type Screen, app } from '../app';
import { cardHtml } from '../cards';
import { formatTime, tabBar, tiles } from '../components';
import { attachLineCharts, lineChartHtml } from '../lineChart';
import { strategyScreen } from './strategy';

const BAND_CLASS: Record<CellBand, string> = { unseen: 'h-unseen', weak: 'h-weak', learning: 'h-learning', solid: 'h-solid' };

function pct(x: number | null): string {
  return x === null ? '–' : `${Math.round(x * 100)}%`;
}

function day(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function dueText(due: number, now: number): string {
  const d = due - now;
  if (d <= 0) return 'due now';
  const h = d / 3_600_000;
  if (h < 1) return `due in ${Math.max(1, Math.round(d / 60_000))} min`;
  if (h < 24) return `due in ${Math.round(h)} h`;
  return `due in ${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'}`;
}

export function statsScreen(): Screen {
  let detail = '';
  let message = '';

  function meter(label: string, t: { attempts: number; correct: number }): string {
    const a = accuracy(t);
    return `<div class="meter-row">
      <span>${label}</span>
      <div class="meter" role="img" aria-label="${label}: ${pct(a)} of ${t.attempts}"><div style="width:${(a ?? 0) * 100}%"></div></div>
      <span class="small"><strong>${pct(a)}</strong> <span class="muted">${t.attempts}</span></span>
    </div>`;
  }

  function heatSection(title: string, classes: HandClass[]): string {
    const head = UPCARDS.map((u) => `<div class="chart-head" role="columnheader">${u === 1 ? 'A' : u}</div>`).join('');
    const rows = classes.map((cls) => {
      const cells = UPCARDS.map((up) => {
        const key = cellKey({ cls, upcard: up });
        const rec = app.progress.cells[key];
        const band = cellBand(rec);
        const a = rec ? rec.correct / rec.attempts : null;
        const text = rec ? String(Math.round(a! * 100)) : '';
        const aria = `${classLabel(cls)} versus ${pipName(up)}: ${rec ? `${rec.correct} of ${rec.attempts} right` : 'not played yet'}`;
        return `<button class="chart-cell heat ${BAND_CLASS[band]}" data-act="cell" data-value="${key}" aria-label="${aria}">${text}</button>`;
      }).join('');
      return `<div class="chart-row" role="row"><div class="chart-label" role="rowheader">${rowLabel(cls)}</div>${cells}</div>`;
    }).join('');
    return `<section class="chart-section"><h3 class="section-label">${title} · dealer upcard</h3>
      <div class="chart-grid" role="table" aria-label="${title} accuracy"><div class="chart-row" role="row"><div class="chart-label"></div>${head}</div>${rows}</div></section>`;
  }

  function cellDetail(key: string): string {
    const cell = parseCellKey(key);
    if (!cell) return '';
    const { cls, upcard: up } = cell;
    const advice = adviseClass(cls, up, app.prefs.rules);
    const rec = app.progress.cells[key];
    const head = `${classLabel(cls)} vs ${pipName(up)}`;
    if (!rec) return `${head}: not played yet. Best play: ${ACTION_LABEL[advice.best].toLowerCase()}.`;
    return `${head}: ${rec.correct} of ${rec.attempts} right · best play ${ACTION_LABEL[advice.best].toLowerCase()} · ${dueText(rec.due, Date.now())}.`;
  }

  function countingSection(): string {
    const runs = app.progress.counts;
    const best = bestDeckTime(app.progress);
    const recent = runs.slice(-10);
    const recentAcc = recent.length ? recent.reduce((s, r) => s + r.accuracy, 0) / recent.length : null;
    const head = tiles([['Count drills', String(runs.length)], ['Last 10', pct(recentAcc)], ['Best deck', best === null ? '–' : formatTime(best)]]);
    if (runs.length < 2) return `${head}<p class="small muted">Charts appear after two count drills.</p>`;
    const last = runs.slice(-20);
    const accChart = lineChartHtml({
      points: last.map((r) => ({ y: r.accuracy * 100, tip: `${day(r.at)} · ${r.variant} ${r.mode}: ${Math.round(r.accuracy * 100)}%` })),
      yMin: 0, yMax: 100, yTicks: [0, 50, 100], yFormat: (v) => `${Math.round(v)}%`,
      label: `Count accuracy over the last ${last.length} drills, latest ${Math.round(last[last.length - 1].accuracy * 100)}%`,
    });
    const maxS = Math.max(2, ...last.map((r) => r.secondsPerCard));
    const speedChart = lineChartHtml({
      points: last.map((r) => ({ y: r.secondsPerCard, tip: `${day(r.at)} · ${r.secondsPerCard.toFixed(1)} s per card` })),
      yMin: 0, yMax: Math.ceil(maxS), yTicks: [0, Math.ceil(maxS) / 2, Math.ceil(maxS)], yFormat: (v) => `${v.toFixed(1)}s`,
      label: `Seconds per card over the last ${last.length} drills, latest ${last[last.length - 1].secondsPerCard.toFixed(1)}`,
    });
    return `${head}
      <h3 class="section-label">Accuracy per drill</h3>${accChart}
      <h3 class="section-label">Seconds per card (lower is faster)</h3>${speedChart}`;
  }

  function trueCountSection(): string {
    const rows = TRUE_COUNT_SOURCES.map((s) => meter(s.name, app.progress.trueCounts[s.id] ?? { attempts: 0, correct: 0 })).join('');
    return `<div class="stack">${rows}</div>`;
  }

  function countPlaySection(): string {
    const rows = DEVIATIONS.filter((d) => app.progress.deviations[d.id]?.attempts);
    if (!rows.length) return '<p class="small muted">No play-the-count hands yet.</p>';
    const acc = (id: string) => { const t = app.progress.deviations[id]; return t.correct / t.attempts; };
    rows.sort((a, b) => acc(a.id) - acc(b.id));
    const label = (d: (typeof DEVIATIONS)[number]) => (d.hand ? `${classLabel(d.hand)} vs ${pipName(d.upcard)}` : 'Insurance');
    return `<div class="stack">${rows.map((d) => meter(label(d), app.progress.deviations[d.id])).join('')}</div>`;
  }

  function mistakeLog(): string {
    const list = [...app.progress.mistakes].reverse().slice(0, 10);
    if (!list.length) return '<p class="small muted">No mistakes logged yet.</p>';
    const items = list.map((m) => `<li class="mistake">
        <div class="hand-row tight">${m.player.map((c) => cardHtml(c, 'small')).join('')}<span class="small muted vs">vs</span>${cardHtml(m.upcard, 'small')}</div>
        <span class="small"><span class="muted">${ACTION_LABEL[m.chosen]} →</span> <span class="good">${ACTION_LABEL[m.best]}</span><br><span class="muted">−${m.lossPer100} per 100 · ${day(m.at)}</span></span>
      </li>`).join('');
    const n = mistakesToReplay(app.progress).length;
    return `<ul class="stack">${items}</ul><button class="btn-secondary" data-act="replay">Replay ${n} mistake${n === 1 ? '' : 's'}</button>`;
  }

  function history(): string {
    const list = [...app.progress.sessions].reverse().slice(0, 15);
    if (!list.length) return '<p class="small muted">No sessions yet.</p>';
    const kind = { strategy: 'Strategy', count: 'Count', true: 'True count', deviation: 'Play the count', bet: 'Bet sizing', table: 'Table' } as const;
    return `<table class="history"><thead><tr><th>Date</th><th>Drill</th><th class="num">Score</th></tr></thead><tbody>${list.map((s) =>
      `<tr><td>${day(s.at)}</td><td>${kind[s.kind]} · ${s.label}</td><td class="num">${s.kind === 'count' && s.total === 1 ? (s.correct ? 'Right' : 'Wrong') : `${s.correct}/${s.total}`}</td></tr>`).join('')}</tbody></table>`;
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify(app.progress, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `blackjack-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importProgress(file: File) {
    try {
      const parsed = parseProgress(JSON.parse(await file.text()));
      if (!window.confirm('Replace your current progress with this file? This cannot be undone.')) return;
      app.progress = parsed;
      app.saveProgress();
      message = 'Progress imported.';
    } catch (e) {
      message = e instanceof SyntaxError ? 'That file is not valid JSON.' : (e as Error).message;
    }
    app.render();
  }

  return {
    render() {
      const p = app.progress;
      const totals = strategyTotals(p);
      const secs = avgDecisionSeconds(p);
      const weak = weakCells(p).slice(0, 5);
      const legend = (Object.keys(BAND_LABEL) as CellBand[]).map((b) =>
        `<li><span class="chart-cell swatch ${BAND_CLASS[b]}"></span><span>${BAND_LABEL[b]}</span></li>`).join('');
      return `<main class="screen with-tabs">
        <header class="home-top"><h1 class="title">Stats</h1><div class="home-top-right">${app.chartButton()}</div></header>

        ${tiles([['Accuracy', pct(accuracy(totals))], ['Decisions', String(totals.attempts)], ['Avg time', secs === null ? '–' : `${secs.toFixed(1)}s`]])}
        <p class="small muted">Streak ${p.streak.current} · best ${p.streak.best} · ${cellsSeen(p)} of ${totalCells()} chart cells played</p>

        <section class="block">
          <h2 class="section-label">By hand type</h2>
          <div class="stack">${meter('Hard totals', totals.byKind.hard)}${meter('Soft totals', totals.byKind.soft)}${meter('Pairs', totals.byKind.pair)}</div>
        </section>

        <section class="block">
          <h2 class="section-label">Heat map</h2>
          <p class="small muted">Percent right per chart cell. Tap a cell for details.</p>
          ${heatSection('Hard totals', HARD_TOTALS.map(hardClass))}
          ${heatSection('Soft totals', SOFT_TOTALS.map(softClass))}
          ${heatSection('Pairs', PAIR_PIPS.map(pairClass))}
          <p class="small cell-detail" aria-live="polite">${detail || '&nbsp;'}</p>
          <ul class="legend">${legend}</ul>
        </section>

        <section class="block">
          <h2 class="section-label">Weak spots</h2>
          ${weak.length ? `<ul class="stack">${weak.map((w) => `<li class="path-row static"><span>${classLabel(w.cell.cls)} vs ${pipName(w.cell.upcard)}</span><span class="small muted">${w.rec.correct}/${w.rec.attempts} · −${Math.round(w.rec.lost)} per 100</span></li>`).join('')}</ul>
            <button class="btn-primary" data-act="practise-weak">Practise weak spots</button>` : '<p class="small muted">None right now.</p>'}
        </section>

        <section class="block"><h2 class="section-label">Counting</h2>${countingSection()}</section>
        <section class="block"><h2 class="section-label">True count</h2>${trueCountSection()}</section>
        <section class="block"><h2 class="section-label">Playing the count</h2>${countPlaySection()}</section>
        <section class="block"><h2 class="section-label">Bet sizing</h2>${p.bets.attempts ? `<div class="stack">${meter('Bets on your spread', p.bets)}</div><p class="small muted">${p.bets.over} over the spread, ${p.bets.under} under, from the bet drill and the table.</p>` : '<p class="small muted">No bets yet.</p>'}</section>
        <section class="block"><h2 class="section-label">Mistake log</h2>${mistakeLog()}</section>
        <section class="block"><h2 class="section-label">Session history</h2>${history()}</section>

        <section class="block">
          <h2 class="section-label">Your data</h2>
          <p class="small muted">Progress is saved in this browser only. Export it to keep a copy or move it to another device.</p>
          <div class="pills">
            <button class="pill" data-act="export">Export</button>
            <label class="pill file-pill">Import<input type="file" accept="application/json,.json" data-import hidden></label>
          </div>
          ${message ? `<p class="small" role="status">${message}</p>` : ''}
        </section>
        ${tabBar('stats')}
      </main>`;
    },

    mounted(root) {
      attachLineCharts(root);
    },

    click(act, el) {
      const v = el.dataset.value ?? '';
      if (act === 'cell') { detail = cellDetail(v); app.render(); }
      else if (act === 'practise-weak') app.go(strategyScreen({ filter: 'weak', autostart: true }));
      else if (act === 'replay') { const s = strategyScreen(); app.go(s); s.click?.('replay', el); }
      else if (act === 'export') exportProgress();
    },

    change(el) {
      if (el instanceof HTMLInputElement && el.dataset.import !== undefined && el.files?.[0]) void importProgress(el.files[0]);
    },
  };
}
