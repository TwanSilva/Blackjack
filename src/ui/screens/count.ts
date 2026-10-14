import {
  type CountMode, type CountResult, type CountSequence, type CountVariant, type Flash, COUNT_VARIANTS, HI_LO,
  MAX_SECONDS, MIN_SECONDS, SPEEDS, buildCountSequence, flashMs, reviewSteps, scoreLearning, scoreTest, signed,
  systemHint,
} from '../../engine';
import { type Screen, app } from '../app';
import { cardHtml } from '../cards';
import {
  PausableTimeout, Stopwatch, drillHeader, formatTime, numpadHtml, numpadInput, numpadKey, optionRow, parseEntry, pills,
} from '../components';
import { icon } from '../icons';

type Phase = 'setup' | 'run' | 'enter' | 'review';

interface LastTap {
  right: boolean;
  value: number;
  tapped: number | null;
}

export function countScreen(): Screen {
  let phase: Phase = 'setup';
  let seq: CountSequence | null = null;
  let index = 0;
  let taps: (number | null)[] = [];
  let mode: CountMode = 'learn';
  let revealed = false;
  let last: LastTap | null = null;
  let timer: PausableTimeout | null = null;
  let paused = false;
  let entry = '';
  let result: CountResult | null = null;
  const watch = new Stopwatch();

  const variantInfo = () => COUNT_VARIANTS.find((v) => v.id === app.prefs.countVariant)!;
  const effectiveMode = (): CountMode => (variantInfo().learnable ? app.prefs.countMode : 'test');
  const seconds = () => app.prefs.countSeconds;

  function speedPills(): string {
    const items = SPEEDS.map((s) => ({ value: s.id, label: s.name, on: Math.abs(s.seconds - seconds()) < 0.001 }));
    return `${pills('speed', items, 'Speed')}
      <div class="stepper">
        <button class="icon-btn" data-act="less-time" aria-label="Less time per card">−</button>
        <span class="small"><strong>${seconds().toFixed(1)} s</strong> <span class="muted">per card</span></span>
        <button class="icon-btn" data-act="more-time" aria-label="More time per card">+</button>
      </div>`;
  }

  function setSeconds(s: number) {
    const v = Math.round(Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, s)) * 10) / 10;
    app.setPrefs({ countSeconds: v });
    app.render();
  }

  // ---------- Running ----------

  function start() {
    seq = buildCountSequence(app.prefs.countVariant, app.prefs.rules);
    mode = effectiveMode();
    index = 0;
    taps = [];
    revealed = false;
    last = null;
    entry = '';
    result = null;
    paused = false;
    phase = 'run';
    watch.start();
    show();
  }

  function show() {
    app.render();
    timer?.cancel();
    timer = new PausableTimeout(onTimeout, flashMs(seq!.flashes[index], seconds()), paused);
  }

  function onTimeout() {
    if (mode === 'learn') record(null);
    else next();
  }

  function record(tapped: number | null) {
    if (phase !== 'run' || paused) return;
    const f = seq!.flashes[index];
    taps[index] = tapped;
    last = { right: tapped === f.value, value: f.value, tapped };
    next();
  }

  function next() {
    timer?.cancel();
    timer = null;
    index++;
    if (index < seq!.flashes.length) { show(); return; }
    watch.pause();
    if (mode === 'learn') {
      result = scoreLearning(seq!, taps);
      phase = 'review';
    } else {
      phase = 'enter';
    }
    app.render();
  }

  function submitEntry() {
    const n = parseEntry(entry);
    if (n === null || !seq) return;
    result = scoreTest(seq, n);
    phase = 'review';
    app.announce(result.correct ? 'Correct' : `Not quite. The count was ${signed(result.actual)}`);
    app.render();
  }

  function flashHtml(f: Flash): string {
    if (f.table) {
      const row = (label: string, cards: typeof f.cards) =>
        `<div class="table-row"><span class="section-label">${label}</span><div class="hand-row tight">${cards.map((c) => cardHtml(c, 'medium')).join('')}</div></div>`;
      return `<div class="table-flash">${row('Dealer', f.table.dealer)}${f.table.players.map((p, i) => row(`Player ${i + 1}`, p)).join('')}</div>`;
    }
    const size = f.cards.length === 1 ? 'xl' : 'big';
    return `<div class="hand-row center">${f.cards.map((c) => cardHtml(c, size)).join('')}</div>`;
  }

  function runView(): string {
    const s = seq!;
    const unit = s.variant === 'pairs' ? 'Hand' : s.variant === 'table' ? 'Round' : 'Card';
    const title = `Hi-Lo count drill · ${unit} ${index + 1} of ${s.flashes.length}`;
    const mine = taps.reduce<number>((a, t) => a + (t ?? 0), 0);
    const actualSoFar = index > 0 ? s.flashes[index - 1].runningAfter : 0;
    const countBlock = revealed
      ? `<div class="big-count">${signed(mine)}</div><p class="small muted">Your taps so far. Actual: ${signed(actualSoFar)}</p>`
      : `<div class="big-count muted" aria-label="Hidden">?</div>`;
    const lastLine = last
      ? last.right
        ? `<p class="tap-result ok">${icon.check(16)} Last card: ${signed(last.value)}</p>`
        : `<p class="tap-result bad">${icon.cross(16)} ${last.tapped === null ? 'Missed' : `You said ${signed(last.tapped)}`}. Last card was ${signed(last.value)}</p>`
      : '<p class="tap-result muted">&nbsp;</p>';
    const controls = mode === 'learn'
      ? `${lastLine}
         <p class="small muted hint">${systemHint(HI_LO)}</p>
         <div class="count-buttons">
           <button class="btn-action" data-act="tap" data-value="1" aria-keyshortcuts="+">+1</button>
           <button class="btn-action" data-act="tap" data-value="0" aria-keyshortcuts="0">0</button>
           <button class="btn-action" data-act="tap" data-value="-1" aria-keyshortcuts="-">−1</button>
         </div>
         <button class="btn-secondary" data-act="reveal">${revealed ? 'Hide my count' : 'Reveal my count'}</button>`
      : `<p class="small muted hint">Keep the running count in your head. You'll enter it after the last ${unit.toLowerCase()}.</p>`;
    return `<main class="screen drill">
      ${drillHeader(title, index / s.flashes.length, 'Stop the drill')}
      ${speedPills()}
      <section class="count-stage" aria-live="off">${flashHtml(s.flashes[index])}</section>
      <section class="count-readout"><span class="section-label">Running count</span>${countBlock}</section>
      ${paused ? '<p class="small muted center-text">Paused</p>' : ''}
      <div class="bottom">${controls}</div>
    </main>`;
  }

  function enterView(): string {
    const s = seq!;
    const what = s.variant === 'deck' ? 'You saw the whole deck.' : `You saw ${s.cardCount} cards.`;
    return `<main class="screen drill">
      ${drillHeader('Hi-Lo count drill · Your count', 1, 'Stop the drill')}
      <p>${what} What's the running count?</p>
      <div class="bottom">${numpadHtml(entry, 'Running count')}</div>
    </main>`;
  }

  // ---------- Review ----------

  function reviewView(): string {
    const s = seq!;
    const r = result!;
    const steps = reviewSteps(s, mode === 'learn' ? taps : undefined);
    const stats: string[] = [];
    if (mode === 'learn') stats.push(`${r.tapsRight} of ${r.tapsTotal} cards right.`);
    else stats.push(`Your count ${signed(r.entered)}, actual ${signed(r.actual)}.`);
    if (s.variant === 'deck') stats.push(`Time: ${formatTime(watch.ms)} for 52 cards.`);
    if (mode === 'learn' && r.firstSlip !== null && r.firstSlip !== undefined) stats.push(`First slip at card ${r.firstSlip + 1}.`);
    if (mode === 'test' && !r.correct) stats.push('The running count after each card is shown below, so you can see where it drifted.');

    const head = r.correct
      ? `<div class="feedback-head"><span class="good-icon">${icon.check(18)}</span><div><strong>${s.variant === 'deck' ? 'Exactly 0' : 'Correct'}</strong></div></div>`
      : `<div class="feedback-head"><span class="bad-icon">${icon.cross(18)}</span><div><strong>Not quite</strong></div></div>`;

    const body = s.variant === 'table' || s.variant === 'pairs'
      ? `<ol class="review-rounds">${steps.map((st) => `<li class="review-round">
          <div class="hand-row tight">${st.flash.cards.map((c) => cardHtml(c, 'small')).join('')}</div>
          <span class="small"><span class="muted">${s.variant === 'table' ? `Round ${st.index + 1}` : `Hand ${st.index + 1}`}: ${signed(st.flash.value)}</span> · running <strong>${signed(st.flash.runningAfter)}</strong></span>
        </li>`).join('')}</ol>`
      : `<ol class="review-grid">${steps.map((st) => {
          const bad = st.right === false;
          const note = bad ? (st.tapped === null ? 'missed' : `said ${signed(st.tapped!)}`) : '';
          return `<li class="review-cell${bad ? ' bad' : ''}" aria-label="Card ${st.index + 1}: running count ${signed(st.flash.runningAfter)}${bad ? `, ${note}` : ''}">
            ${cardHtml(st.flash.cards[0], 'small')}
            <span class="rc">${signed(st.flash.runningAfter)}</span>
            ${bad ? `<span class="note">${note}</span>` : ''}
          </li>`;
        }).join('')}</ol>`;

    return `<main class="screen">
      ${drillHeader('Count review', undefined, 'Back to count drill setup')}
      <section class="feedback ${r.correct ? 'ok' : ''}">${head}<p>${stats.join(' ')}</p></section>
      <section class="block"><h2 class="section-label">Running count after each ${s.variant === 'table' ? 'round' : s.variant === 'pairs' ? 'hand' : 'card'}</h2>${body}</section>
      <div class="bottom">
        <button class="btn-primary" data-act="start">Again</button>
        <button class="btn-secondary" data-act="back">Change drill</button>
      </div>
    </main>`;
  }

  // ---------- Setup ----------

  function setupView(): string {
    const v = variantInfo();
    const variants = COUNT_VARIANTS.map((x) => optionRow('variant', x.id, x.name, x.detail, x.id === v.id)).join('');
    const m = effectiveMode();
    const modes = pills('mode', [
      { value: 'learn', label: 'Learn', on: m === 'learn', disabled: !v.learnable },
      { value: 'test', label: 'Test', on: m === 'test' },
    ], 'Mode');
    const modeNote = m === 'learn'
      ? 'Tap +1, 0 or −1 for every card before it goes. A card you miss counts as wrong.'
      : 'Cards go by at your speed. Enter the final running count at the end.';
    return `<main class="screen">
      ${drillHeader('Hi-Lo count drill', undefined, 'Back to drills')}
      <p class="small muted">${systemHint(HI_LO)} Shoes use your table's ${app.prefs.rules.decks} deck${app.prefs.rules.decks === 1 ? '' : 's'}.</p>
      <section class="block"><h2 class="section-label">Drill</h2><div class="stack">${variants}</div></section>
      <section class="block"><h2 class="section-label">Mode</h2>${modes}<p class="small muted">${v.learnable ? modeNote : 'Several cards show at once here, so this one is test mode only.'}</p></section>
      <section class="block"><h2 class="section-label">Speed</h2>${speedPills()}</section>
      <div class="bottom"><button class="btn-primary" data-act="start">Start</button></div>
    </main>`;
  }

  function stop() {
    timer?.cancel();
    timer = null;
    phase = 'setup';
    app.render();
  }

  return {
    render() {
      if (phase === 'run' && seq) return runView();
      if (phase === 'enter' && seq) return enterView();
      if (phase === 'review' && seq && result) return reviewView();
      return setupView();
    },

    click(act, el) {
      const v = el.dataset.value ?? '';
      switch (act) {
        case 'back': if (phase === 'setup') app.goHome(); else stop(); break;
        case 'variant': app.setPrefs({ countVariant: v as CountVariant }); app.render(); break;
        case 'mode': app.setPrefs({ countMode: v as CountMode }); app.render(); break;
        case 'speed': setSeconds(SPEEDS.find((s) => s.id === v)!.seconds); break;
        case 'more-time': setSeconds(seconds() + 0.1); break;
        case 'less-time': setSeconds(seconds() - 0.1); break;
        case 'start': start(); break;
        case 'tap': record(Number(v)); break;
        case 'reveal': revealed = !revealed; app.render(); break;
        case 'np-submit': submitEntry(); break;
        default: {
          const nextEntry = numpadInput(entry, act, v);
          if (nextEntry !== null) { entry = nextEntry; app.render(); }
        }
      }
    },

    key(e) {
      if (phase === 'run' && mode === 'learn') {
        if (e.key === '+' || e.key === '=' || e.key === 'ArrowUp') { record(1); return true; }
        if (e.key === '0' || e.key === ' ') { record(0); return true; }
        if (e.key === '-' || e.key === 'ArrowDown') { record(-1); return true; }
      }
      if (phase === 'enter') {
        if (e.key === 'Enter') { submitEntry(); return true; }
        const nextEntry = numpadKey(entry, e);
        if (nextEntry !== null) { entry = nextEntry; app.render(); return true; }
      }
      return false;
    },

    pause() {
      if (phase !== 'run' || paused) return;
      paused = true;
      timer?.pause();
      watch.pause();
      app.render();
    },

    resume() {
      if (phase !== 'run' || !paused) return;
      paused = false;
      watch.resume();
      timer?.resume();
      app.render();
    },

    leave() {
      timer?.cancel();
    },
  };
}
