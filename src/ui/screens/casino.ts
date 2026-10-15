import { rulesDescription } from '../../engine';
import { type Screen, app } from '../app';
import { drillHeader, pills } from '../components';
import { icon } from '../icons';
import { rulesFormHtml, withRule } from '../rulesForm';
import type { MyCasino, ShuffleMethod } from '../storage';

/** Every item to confirm at the table, in the order of UX Blackjack.md section 7. */
const ITEMS: { id: string; label: string }[] = [
  { id: 'decks', label: 'Number of decks' },
  { id: 'hitSoft17', label: 'Dealer on soft 17' },
  { id: 'blackjackPays', label: 'Blackjack payout' },
  { id: 'dealerPeeks', label: 'Hole card (peek or European no hole card)' },
  { id: 'doubleOn', label: 'Double rules' },
  { id: 'doubleAfterSplit', label: 'Double after split' },
  { id: 'resplitAces', label: 'Resplit aces' },
  { id: 'maxSplitHands', label: 'How many hands you can split to' },
  { id: 'surrender', label: 'Surrender' },
  { id: 'penetration', label: 'Penetration (how much of the shoe is dealt before the shuffle)' },
  { id: 'limits', label: 'Table minimum and maximum' },
  { id: 'shuffle', label: 'Shuffled by hand, by a shuffling machine, or a continuous shuffler' },
];

const SHUFFLE_LABEL: Record<ShuffleMethod, string> = {
  unknown: 'Not checked', hand: 'By hand', machine: 'Automatic shuffler (between shoes)', continuous: 'Continuous shuffler',
};

/** The "My casino" preset and the checklist for the next visit. Unverified until every item is checked in person. */
export function casinoScreen(): Screen {
  const save = (patch: Partial<MyCasino>) => app.setPrefs({ myCasino: { ...app.prefs.myCasino, ...patch } });
  // Each change redraws the page; this puts keyboard focus back on the control that was changed.
  let refocus: string | null = null;

  return {
    render() {
      const c = app.prefs.myCasino;
      const done = ITEMS.filter((i) => c.checked[i.id]).length;
      const check = (id: string) => `<input type="checkbox" class="check" data-check="${id}" aria-label="Checked at the table: ${ITEMS.find((i) => i.id === id)?.label ?? id}"${c.checked[id] ? ' checked' : ''}>`;
      const shufflePills = pills('shuffle', (Object.keys(SHUFFLE_LABEL) as ShuffleMethod[]).map((s) => ({ value: s, label: SHUFFLE_LABEL[s], on: c.shuffle === s })), 'Shuffle method');
      return `<main class="screen">
        ${drillHeader(`${c.name}`, undefined, 'Back to Settings')}
        <p class="${c.verified ? 'good' : 'warn-text'} small">${c.verified ? `${icon.check(14)} Checked at the table.` : 'Unverified. These are guesses until you check the posted rules and ask the dealer on your next visit.'}</p>
        <p class="small muted">Tick each item once you have seen it at the table. Changing a rule clears its tick.</p>
        <section class="block"><h2 class="section-label">Rules · ${done} of ${ITEMS.length} checked</h2>
          ${rulesFormHtml(c.rules, 'mc-', check)}
        </section>
        <section class="block"><h2 class="section-label">Table limits</h2>
          <div class="rules">
            <label class="rule-row"><span>Minimum bet</span><span class="rule-control"><input class="num-input" type="number" min="0" inputmode="numeric" data-limit="tableMin" value="${c.tableMin ?? ''}" placeholder="?"></span></label>
            <label class="rule-row"><span>Maximum bet</span><span class="rule-control"><input class="num-input" type="number" min="0" inputmode="numeric" data-limit="tableMax" value="${c.tableMax ?? ''}" placeholder="?"></span></label>
            <label class="rule-row"><span>Both checked</span><span class="rule-control">${check('limits')}</span></label>
          </div>
        </section>
        <section class="block"><h2 class="section-label">Shuffle</h2>${shufflePills}
          <label class="rule-row bare"><span>Checked</span>${check('shuffle')}</label>
          ${c.shuffle === 'continuous' ? `<p class="index-warning small" role="note">${icon.alert()} <span>A continuous shuffler puts used cards back in all the time, so the count never builds up. Counting and bet spreads don’t work at that table; basic strategy still does.</span></p>` : ''}
        </section>
        <p class="small muted">${rulesDescription(c.rules)}</p>
        <div class="bottom">
          <button class="btn-primary" data-act="use">Use these rules now</button>
          <button class="btn-secondary" data-act="verify"${done === ITEMS.length && !c.verified ? '' : ' disabled'}>${c.verified ? 'Verified' : done === ITEMS.length ? 'Mark as checked at the table' : `Check all ${ITEMS.length} items to verify`}</button>
        </div>
      </main>`;
    },
    mounted(root) {
      if (refocus) root.querySelector<HTMLElement>(refocus)?.focus({ preventScroll: true });
      refocus = null;
    },
    click(act, el) {
      const c = app.prefs.myCasino;
      if (act === 'back') { app.goTab('settings'); return; }
      if (act === 'use') { app.setPrefs({ rules: { ...c.rules } }); app.goTab('settings'); return; }
      if (act === 'verify') { save({ verified: true }); app.render(); return; }
      if (act === 'shuffle') {
        save({ shuffle: el.dataset.value as ShuffleMethod, checked: { ...c.checked, shuffle: false }, verified: false });
        app.render();
      }
    },
    change(el) {
      const c = app.prefs.myCasino;
      refocus = el.dataset.check ? `[data-check="${el.dataset.check}"]` : el.dataset.rule ? `[data-form="mc-"][data-rule="${el.dataset.rule}"]` : el.dataset.limit ? `[data-limit="${el.dataset.limit}"]` : null;
      if (el.dataset.form === 'mc-' && el.dataset.rule) {
        const id = el.dataset.rule;
        save({ rules: withRule(c.rules, id, el.value), checked: { ...c.checked, [id]: false }, verified: false });
        app.render();
      } else if (el.dataset.check) {
        const checked = { ...c.checked, [el.dataset.check]: (el as HTMLInputElement).checked };
        save({ checked, verified: c.verified && (el as HTMLInputElement).checked });
        app.render();
      } else if (el.dataset.limit) {
        const v = el.value === '' ? null : Math.max(0, Number(el.value));
        save({ [el.dataset.limit]: v, checked: { ...c.checked, limits: false }, verified: false } as Partial<MyCasino>);
        app.render();
      }
    },
  };
}
