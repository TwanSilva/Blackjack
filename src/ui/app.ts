import { type Advice, type Progress, INSURANCE_DEVIATION, buildChart, deviationMismatch } from '../engine';
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
  /** The tab the player last opened; "back" from a drill returns there. */
  lastTab: 'learn',

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

  /** Back to the tab the player came from (Learn the first time). */
  goHome(): void {
    const tab = app.tabs[app.lastTab];
    app.go(tab ? tab() : app.home());
  },

  goTab(id: string): void {
    if (!app.tabs[id]) return;
    app.lastTab = id;
    app.go(app.tabs[id]());
  },

  /** Applies display settings: reduce motion, high contrast and text size. */
  applyDisplay(): void {
    const d = app.prefs.display;
    const html = document.documentElement;
    html.classList.toggle('reduce-motion', d.reduceMotion);
    html.classList.toggle('high-contrast', d.highContrast);
    html.dataset.text = d.textSize;
  },

  render(): void {
    if (!current) return;
    root.innerHTML = current.render();
    current.mounted?.(root);
  },

  /** Screen-reader announcement. "Correct…" and "Not quite…" also give the sound and vibration feedback. */
  announce(text: string): void {
    live.textContent = text;
    const kind = text.startsWith('Correct') ? 'right' : text.startsWith('Not quite') ? 'wrong' : null;
    if (kind) feedback(kind);
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
    const warning = deviationMismatch(INSURANCE_DEVIATION, app.prefs.tcRounding, app.prefs.rules);
    overlay.innerHTML = chartHtml(buildChart(app.prefs.rules), current?.chartFocus?.() ?? null, warning);
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
  else if (act === 'tab' && !chartOpen) app.goTab(el.dataset.value!);
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

// ---------- Sound and vibration ----------

let audio: AudioContext | null = null;

/** A short tone (higher for right) and a short buzz, each only if switched on in Settings. */
function feedback(kind: 'right' | 'wrong'): void {
  const d = app.prefs.display;
  if (d.haptics && 'vibrate' in navigator) {
    try { navigator.vibrate(kind === 'right' ? 15 : [30, 40, 30]); } catch { /* not supported */ }
  }
  if (!d.sound) return;
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = kind === 'right' ? 880 : 220;
    gain.gain.setValueAtTime(0.08, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.2);
  } catch {
    // Audio unavailable: silent.
  }
}
