import { type Advice, type Progress, buildChart } from '../engine';
import { chartHtml } from './chart';
import { icon } from './icons';
import { type Prefs, load, loadProgress, save, saveProgress } from './storage';

/** One screen of the app. The shell owns the chart overlay, keyboard routing and pausing. */
export interface Screen {
  render(): string;
  click?(act: string, el: HTMLElement): void;
  change?(el: HTMLSelectElement | HTMLInputElement): void;
  /** Return true when the key was handled. */
  key?(e: KeyboardEvent): boolean;
  /** Stop timers: the chart opened or the page was hidden. */
  pause?(): void;
  resume?(): void;
  /** Leaving this screen for another one. */
  leave?(): void;
  /** Called after each render with the root element, for listeners that need real DOM nodes. */
  mounted?(root: HTMLElement): void;
  /** The hand whose chart cell should be ringed when the chart opens. */
  chartFocus?(): Advice | null;
  /** True while the chart button should be disabled (for example during the correct-answer flash). */
  chartBlocked?(): boolean;
}

const root = document.getElementById('app')!;
const overlay = document.getElementById('overlay')!;
const live = document.getElementById('live')!;

let current: Screen | null = null;
let chartOpen = false;
let chartReturnFocus: HTMLElement | null = null;

export const app = {
  prefs: load() as Prefs,
  /** The player model. Drills update it in place, then call saveProgress(). */
  progress: loadProgress() as Progress,

  saveProgress(): void {
    saveProgress(app.progress);
  },
  /** Set by main.ts: builds the home screen. */
  home: (() => { throw new Error('home not set'); }) as () => Screen,
  /** Set by main.ts: the screens behind the bottom tab bar. */
  tabs: {} as Record<string, () => Screen>,

  setPrefs(patch: Partial<Prefs>): void {
    app.prefs = { ...app.prefs, ...patch };
    save(app.prefs);
  },

  go(screen: Screen): void {
    current?.leave?.();
    current = screen;
    app.render();
    window.scrollTo(0, 0);
  },

  goHome(): void {
    app.go(app.home());
  },

  render(): void {
    if (!current) return;
    root.innerHTML = current.render();
    current.mounted?.(root);
  },

  announce(text: string): void {
    live.textContent = text;
  },

  get chartOpen(): boolean {
    return chartOpen;
  },

  chartButton(): string {
    const blocked = current?.chartBlocked?.() ?? false;
    return `<button class="icon-btn" data-act="open-chart" aria-label="Basic strategy chart" aria-keyshortcuts="C"${blocked ? ' disabled' : ''}>${icon.grid()}</button>`;
  },

  openChart(): void {
    if (chartOpen || current?.chartBlocked?.()) return;
    chartReturnFocus = document.activeElement as HTMLElement | null;
    chartOpen = true;
    current?.pause?.();
    overlay.innerHTML = chartHtml(buildChart(app.prefs.rules), current?.chartFocus?.() ?? null);
    document.body.classList.add('no-scroll');
    overlay.querySelector<HTMLElement>('[data-act="close-chart"]')?.focus();
    overlay.querySelector('[data-ring]')?.scrollIntoView({ block: 'center' });
  },

  closeChart(): void {
    if (!chartOpen) return;
    chartOpen = false;
    overlay.innerHTML = '';
    document.body.classList.remove('no-scroll');
    chartReturnFocus?.focus();
    if (!document.hidden) current?.resume?.();
  },
};

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  const act = el.dataset.act!;
  if (act === 'open-chart') app.openChart();
  else if (act === 'tab' && !chartOpen && app.tabs[el.dataset.value!]) app.go(app.tabs[el.dataset.value!]());
  else if (act === 'close-chart') app.closeChart();
  else if (!chartOpen) current?.click?.(act, el);
});

document.addEventListener('change', (e) => {
  current?.change?.(e.target as HTMLSelectElement);
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.target as HTMLElement).tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  if (chartOpen) {
    if (k === 'escape' || k === 'c') { e.preventDefault(); app.closeChart(); }
    return;
  }
  if (current?.key?.(e)) { e.preventDefault(); return; }
  if (k === 'c') { e.preventDefault(); app.openChart(); }
});

// Keep focus inside the chart dialog while it is open.
overlay.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const close = overlay.querySelector<HTMLElement>('[data-act="close-chart"]');
  if (close) { e.preventDefault(); close.focus(); }
});

// A drill shouldn't keep dealing while the page is in the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) current?.pause?.();
  else if (!chartOpen) current?.resume?.();
});
