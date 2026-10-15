import { app } from './app';
import { icon } from './icons';

/** Back button, centered title, chart button, then a progress bar when `progress` is given (0 to 1). */
export function drillHeader(title: string, progress?: number, backLabel = 'Back'): string {
  const bar = progress === undefined
    ? ''
    : `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}"><div style="width:${progress * 100}%"></div></div>`;
  return `<header class="drill-top">
      <button class="icon-btn" data-act="back" aria-label="${backLabel}">${icon.back()}</button>
      <div class="drill-title">${title}</div>
      ${app.chartButton()}
    </header>${bar}`;
}

export function optionRow(act: string, value: string, name: string, detail: string, on: boolean, disabled = false): string {
  return `<button class="path-row${on ? ' current' : ''}" data-act="${act}" data-value="${value}" aria-pressed="${on}"${disabled ? ' disabled' : ''}>
    <span class="row-text"><span>${name}</span>${detail ? `<span class="small muted">${detail}</span>` : ''}</span>
    <span class="muted">${on ? icon.check(18) : ''}</span></button>`;
}

export function navRow(act: string, value: string, name: string, detail: string): string {
  return `<button class="path-row" data-act="${act}" data-value="${value}">
    <span class="row-text"><span>${name}</span><span class="small muted">${detail}</span></span>
    <span class="muted">${icon.chevron()}</span></button>`;
}

export function pills(act: string, items: { value: string; label: string; on: boolean; disabled?: boolean }[], label: string): string {
  return `<div class="pills" role="group" aria-label="${label}">${items.map((i) =>
    `<button class="pill${i.on ? ' on' : ''}" data-act="${act}" data-value="${i.value}" aria-pressed="${i.on}"${i.disabled ? ' disabled' : ''}>${i.label}</button>`).join('')}</div>`;
}

export function tiles(items: [string, string][]): string {
  return `<div class="tiles">${items.map(([l, v]) => `<div class="tile"><div class="tile-label">${l}</div><div class="tile-value">${v}</div></div>`).join('')}</div>`;
}

/** Bottom tab bar. Learn and Settings join it with the learning path (build step 8). */
export function tabBar(active: 'drill' | 'stats'): string {
  const tab = (id: 'drill' | 'stats', label: string) =>
    `<button class="tab${id === active ? ' on' : ''}" data-act="tab" data-value="${id}"${id === active ? ' aria-current="page"' : ''}>${label}</button>`;
  return `<nav class="tabbar" aria-label="Main">${tab('drill', 'Drill')}${tab('stats', 'Stats')}</nav>`;
}

// ---------- Number pad ----------

/** Shows a signed whole number being typed. `entry` is the raw text, for example "-12" or "". */
export function numpadHtml(entry: string, label: string, submitLabel = 'Check'): string {
  const shown = entry === '' || entry === '-' ? (entry === '-' ? '−' : '?') : entry.startsWith('-') ? `−${entry.slice(1)}` : entry === '0' ? '0' : `+${entry}`;
  const key = (act: string, text: string, aria: string, value = '') =>
    `<button class="np-key" data-act="${act}" data-value="${value}" aria-label="${aria}">${text}</button>`;
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => key('np-digit', String(d), String(d), String(d))).join('');
  return `<div class="numpad">
    <div class="np-display"><span class="section-label">${label}</span><span class="np-value${entry === '' ? ' muted' : ''}" aria-live="polite">${shown}</span></div>
    <div class="np-grid">${digits}${key('np-sign', '±', 'Change sign')}${key('np-digit', '0', '0', '0')}${key('np-back', icon.backspace(), 'Delete')}</div>
    <button class="btn-primary" data-act="np-submit"${parseEntry(entry) === null ? ' disabled' : ''}>${submitLabel}</button>
  </div>`;
}

export function parseEntry(entry: string): number | null {
  if (entry === '' || entry === '-') return null;
  const n = Number(entry);
  return Number.isFinite(n) ? n : null;
}

/** Applies a number pad button or a key to the entry. Returns null when the input isn't a number pad input. */
export function numpadInput(entry: string, act: string, value = ''): string | null {
  if (act === 'np-digit') {
    const digits = entry.replace('-', '');
    if (digits.length >= 3) return entry;
    const next = (digits === '0' ? '' : digits) + value;
    return entry.startsWith('-') ? `-${next}` : next;
  }
  if (act === 'np-sign') return entry.startsWith('-') ? entry.slice(1) : `-${entry}`;
  if (act === 'np-back') return entry.slice(0, -1);
  return null;
}

/** Keyboard support for the number pad: digits, minus, Backspace. Enter is handled by the screen. */
export function numpadKey(entry: string, e: KeyboardEvent): string | null {
  if (/^[0-9]$/.test(e.key)) return numpadInput(entry, 'np-digit', e.key);
  if (e.key === '-' || e.key === '+') return e.key === '-' ? numpadInput(entry, 'np-sign') : entry.replace('-', '');
  if (e.key === 'Backspace') return numpadInput(entry, 'np-back');
  return null;
}

// ---------- Timers that can pause ----------

export class PausableTimeout {
  private id: number | null = null;
  private remaining: number;
  private startedAt = 0;

  constructor(private readonly fn: () => void, ms: number, paused = false) {
    this.remaining = ms;
    if (!paused) this.resume();
  }

  pause(): void {
    if (this.id === null) return;
    clearTimeout(this.id);
    this.id = null;
    this.remaining -= performance.now() - this.startedAt;
  }

  resume(): void {
    if (this.id !== null) return;
    this.startedAt = performance.now();
    this.id = window.setTimeout(() => { this.id = null; this.fn(); }, Math.max(0, this.remaining));
  }

  cancel(): void {
    if (this.id !== null) clearTimeout(this.id);
    this.id = null;
  }
}

/** Counts only the time while running. */
export class Stopwatch {
  private total = 0;
  private since: number | null = null;

  start(): void {
    this.total = 0;
    this.since = performance.now();
  }
  pause(): void {
    if (this.since !== null) this.total += performance.now() - this.since;
    this.since = null;
  }
  resume(): void {
    if (this.since === null) this.since = performance.now();
  }
  get ms(): number {
    return this.total + (this.since !== null ? performance.now() - this.since : 0);
  }
}

export function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
