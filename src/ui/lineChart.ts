/**
 * A small single-series line chart: hairline grid, 2px line, ringed end dot labelled with its value,
 * and a crosshair tooltip on hover or touch. One series, so no legend: the section title names it.
 */

export interface LinePoint {
  y: number;
  /** Tooltip text for this point. */
  tip: string;
}

export interface LineChartSpec {
  points: LinePoint[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  yFormat: (v: number) => string;
  label: string;
}

const W = 350;
const H = 140;
const M = { left: 36, right: 40, top: 10, bottom: 10 };

export function lineChartHtml(spec: LineChartSpec): string {
  const { points, yMin, yMax } = spec;
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (i: number) => M.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => M.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const grid = spec.yTicks.map((t) =>
    `<line x1="${M.left}" x2="${W - M.right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="lc-grid"/>
     <text x="${M.left - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" class="lc-tick">${spec.yFormat(t)}</text>`).join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
  const lastI = points.length - 1;
  const last = points[lastI];
  const xs = points.map((_, i) => x(i).toFixed(1)).join(',');
  const ys = points.map((p) => y(p.y).toFixed(1)).join(',');
  const tips = encodeURIComponent(JSON.stringify(points.map((p) => p.tip)));
  return `<div class="linechart" data-xs="${xs}" data-ys="${ys}" data-tips="${tips}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${spec.label}">
      ${grid}
      <path d="${path}" class="lc-line"/>
      <circle cx="${x(lastI).toFixed(1)}" cy="${y(last.y).toFixed(1)}" r="4" class="lc-dot"/>
      <text x="${(x(lastI) + 8).toFixed(1)}" y="${(y(last.y) + 4).toFixed(1)}" class="lc-end">${spec.yFormat(last.y)}</text>
      <line class="lc-cross" x1="0" x2="0" y1="${M.top}" y2="${H - M.bottom}" visibility="hidden"/>
      <circle class="lc-hover" r="4" visibility="hidden"/>
      <rect class="lc-hit" x="${M.left - 10}" y="0" width="${iw + 20}" height="${H}"/>
    </svg>
    <div class="lc-tip" hidden></div>
  </div>`;
}

/** Wires hover and touch on every line chart under `root`. */
export function attachLineCharts(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.linechart').forEach((box) => {
    const svg = box.querySelector('svg')!;
    const xs = box.dataset.xs!.split(',').map(Number);
    const ys = box.dataset.ys!.split(',').map(Number);
    const tips = JSON.parse(decodeURIComponent(box.dataset.tips!)) as string[];
    const cross = svg.querySelector<SVGLineElement>('.lc-cross')!;
    const dot = svg.querySelector<SVGCircleElement>('.lc-hover')!;
    const tip = box.querySelector<HTMLElement>('.lc-tip')!;
    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    };
    const show = (clientX: number) => {
      const r = svg.getBoundingClientRect();
      const vx = ((clientX - r.left) / r.width) * W;
      let best = 0;
      for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - vx) < Math.abs(xs[best] - vx)) best = i;
      cross.setAttribute('x1', String(xs[best]));
      cross.setAttribute('x2', String(xs[best]));
      cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', String(xs[best]));
      dot.setAttribute('cy', String(ys[best]));
      dot.setAttribute('visibility', 'visible');
      tip.textContent = tips[best];
      tip.hidden = false;
      const left = (xs[best] / W) * r.width;
      tip.style.left = `${Math.min(Math.max(left, 60), r.width - 60)}px`;
    };
    svg.addEventListener('pointermove', (e) => show(e.clientX));
    svg.addEventListener('pointerdown', (e) => show(e.clientX));
    svg.addEventListener('pointerleave', hide);
  });
}
