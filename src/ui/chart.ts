import { type Advice, type ChartCode, type StrategyChart, pipName } from '../engine';
import { icon } from './icons';

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

/** The basic strategy overlay, rendered straight from the engine's chart. `focus` rings the current hand's cell. */
export function chartHtml(chart: StrategyChart, focus: Advice | null): string {
  const ring = (sectionId: string, rowKey: string, col: number) => {
    if (!focus?.chart) return false;
    if (chart.upcards[col] !== focus.upcard || rowKey !== focus.chart.rowKey) return false;
    return sectionId === focus.chart.section || (sectionId === 'surrender' && focus.best === 'surrender');
  };
  const head = chart.upcards.map((u) => `<div class="chart-head" role="columnheader">${u === 1 ? 'A' : u}</div>`).join('');

  const sections = chart.sections.map((s) => {
    const rows = s.rows.map((r) => {
      const cells = r.cells.map((c, col) => {
        const hl = ring(s.id, r.key, col);
        return `<div class="chart-cell ${codeClass(c.code)}${hl ? ' ring' : ''}" role="cell" aria-label="${c.label}"${hl ? ' data-ring' : ''}>${c.code}</div>`;
      }).join('');
      return `<div class="chart-row" role="row"><div class="chart-label" role="rowheader">${r.label}</div>${cells}</div>`;
    }).join('');
    const body = s.rows.length
      ? `<div class="chart-grid" role="table" aria-label="${s.title} by dealer upcard"><div class="chart-row" role="row"><div class="chart-label"></div>${head}</div>${rows}</div>`
      : `<p class="muted small">${s.empty ?? ''}</p>`;
    return `<section class="chart-section"><h2 class="section-label">${s.title} · dealer upcard</h2>${body}</section>`;
  }).join('');

  const legend = chart.legend.map((l) =>
    `<li><span class="chart-cell swatch ${codeClass(l.code)}">${l.code}</span><span>${l.meaning}</span></li>`).join('');

  const focusLine = focus
    ? `<p class="small muted chart-focus">Ringed: ${focus.handLabel.toLowerCase()} against a dealer ${pipName(focus.upcard)}.</p>`
    : '';

  return `<div class="chart-overlay" role="dialog" aria-modal="true" aria-labelledby="chart-title">
    <div class="chart-inner">
      <header class="chart-top">
        <h1 id="chart-title" class="title">Basic strategy</h1>
        <button class="icon-btn" data-act="close-chart" aria-label="Close chart">${icon.close()}</button>
      </header>
      <p class="small muted">${chart.rulesLine}</p>
      ${focusLine}
      ${sections}
      <p class="chart-insurance">${chart.insurance}</p>
      <section class="chart-section"><h2 class="section-label">Key</h2><ul class="legend">${legend}</ul></section>
    </div>
  </div>`;
}
