import { describe, expect, test } from 'vitest';
import {
  type Action, type Card, type DeckCount, type Pip, type Rank, type Rules, DEFAULT_RULES, UPCARDS,
  adviseClass, allClasses, bestPlay, buildChart, chartAction, classKey, compositions, explain, hardClass,
  pairClass, softClass,
} from '../src/engine';

// Section 9 of UX Blackjack.md. Every check runs for H17 and S17, at 4, 6 and 8 decks,
// with double after split and late surrender (the stated baseline), dealer peeks.

const c = (rank: Rank): Card => ({ rank, suit: 'clubs' });
const up = (p: Pip): Card => c(p === 1 ? 'A' : (String(p) as Rank));
const play = (ranks: Rank[], u: Pip, rules: Rules, tc?: number): Action => bestPlay(ranks.map(c), up(u), rules, tc).best;

const variants: { name: string; rules: Rules }[] = [];
for (const hitSoft17 of [true, false]) {
  for (const decks of [4, 6, 8] as DeckCount[]) {
    variants.push({
      name: `${hitSoft17 ? 'H17' : 'S17'} ${decks} decks`,
      rules: { ...DEFAULT_RULES, decks, hitSoft17, doubleAfterSplit: true, surrender: 'late', dealerPeeks: true },
    });
  }
}

describe.each(variants)('$name', ({ rules }) => {
  const noSurrender: Rules = { ...rules, surrender: 'none' };

  test('always split 8-8 and A-A', () => {
    for (const u of UPCARDS) {
      expect(play(['A', 'A'], u, rules), `A-A vs ${u}`).toBe('split');
      expect(play(['8', '8'], u, noSurrender), `8-8 vs ${u}, no surrender`).toBe('split');
      // With surrender on the table, 8-8 is never hit or stood: it is split, or surrendered where that is worth more.
      const withSur = play(['8', '8'], u, rules);
      expect(['split', 'surrender'], `8-8 vs ${u}`).toContain(withSur);
      if (withSur === 'surrender') {
        // Only ever against an Ace, and only under H17.
        expect(u).toBe(1);
        expect(rules.hitSoft17).toBe(true);
      }
    }
  });

  test('never split 10-10 or 5-5', () => {
    for (const u of UPCARDS) {
      expect(play(['10', 'K'], u, rules), `10-K vs ${u}`).not.toBe('split');
      expect(play(['Q', 'Q'], u, rules), `Q-Q vs ${u}`).not.toBe('split');
      expect(play(['5', '5'], u, rules), `5-5 vs ${u}`).not.toBe('split');
    }
  });

  test('9-9: split vs 9, stand vs 7', () => {
    expect(play(['9', '9'], 9, rules)).toBe('split');
    expect(play(['9', '9'], 7, rules)).toBe('stand');
  });

  test('11 vs 6: double. 10 vs 10: hit', () => {
    expect(play(['5', '6'], 6, rules)).toBe('double');
    expect(play(['8', '3'], 6, rules)).toBe('double');
    expect(play(['6', '4'], 10, rules)).toBe('hit');
    expect(play(['7', '3'], 10, rules)).toBe('hit');
  });

  test('12 vs 4: stand. 13 vs 5: stand. 14 vs 7: hit', () => {
    expect(play(['10', '2'], 4, rules)).toBe('stand');
    expect(play(['9', '3'], 4, rules)).toBe('stand');
    expect(play(['10', '3'], 5, rules)).toBe('stand');
    expect(play(['8', '5'], 5, rules)).toBe('stand');
    expect(play(['10', '4'], 7, rules)).toBe('hit');
    expect(play(['9', '5'], 7, rules)).toBe('hit');
  });

  test('16 vs 10: hit when surrender is not allowed', () => {
    expect(play(['10', '6'], 10, noSurrender)).toBe('hit');
    expect(play(['9', '7'], 10, noSurrender)).toBe('hit');
  });

  test('11 vs Ace: double under H17, hit under S17', () => {
    expect(play(['6', '5'], 1, rules)).toBe(rules.hitSoft17 ? 'double' : 'hit');
    expect(play(['7', '4'], 1, rules)).toBe(rules.hitSoft17 ? 'double' : 'hit');
  });

  test('late surrender cells', () => {
    expect(play(['10', '6'], 10, rules)).toBe('surrender');
    expect(play(['10', '6'], 9, rules)).toBe('surrender');
    expect(play(['10', '6'], 1, rules)).toBe('surrender');
    expect(play(['10', '5'], 10, rules)).toBe('surrender');
    if (rules.hitSoft17) {
      expect(play(['10', '5'], 1, rules)).toBe('surrender');
      expect(play(['10', '7'], 1, rules)).toBe('surrender');
    } else {
      expect(play(['10', '5'], 1, rules)).toBe('hit');
      expect(play(['10', '7'], 1, rules)).toBe('stand');
    }
  });

  test('insurance only at true count +3 or higher', () => {
    const a = (tc?: number) => bestPlay([c('10'), c('7')], up(1), rules, tc).insurance!;
    expect(a().take).toBe(false);
    expect(a(-2).take).toBe(false);
    expect(a(2).take).toBe(false);
    expect(a(2.9).take).toBe(false);
    expect(a(3).take).toBe(true);
    expect(a(6).take).toBe(true);
    expect(a().evOffTop).toBeLessThan(0);
    expect(bestPlay([c('10'), c('7')], up(10), rules, 5).insurance).toBeNull();
  });

  test('chart and oracle never disagree, for every card combination', () => {
    const chart = buildChart(rules);
    for (const cls of allClasses()) {
      for (const u of UPCARDS) {
        const fromChart = chartAction(chart, cls, u);
        for (const [a, b] of compositions(cls)) {
          const ranks = [a, b].map((p) => (p === 1 ? 'A' : p === 10 ? 'K' : String(p)) as Rank);
          expect(play(ranks, u, rules), `${classKey(cls)} as ${ranks} vs ${u}`).toBe(fromChart);
        }
      }
    }
  });
});

describe('strategy follows the rules', () => {
  test('H17 and S17 charts differ', () => {
    const h17 = buildChart(DEFAULT_RULES);
    const s17 = buildChart({ ...DEFAULT_RULES, hitSoft17: false });
    expect(chartAction(h17, hardClass(11), 1)).toBe('double');
    expect(chartAction(s17, hardClass(11), 1)).toBe('hit');
    expect(chartAction(h17, softClass(19), 6)).toBe('double');
    expect(chartAction(s17, softClass(19), 6)).toBe('stand');
  });

  test('no surrender removes every surrender cell', () => {
    const chart = buildChart({ ...DEFAULT_RULES, surrender: 'none' });
    expect(chart.sections.find((s) => s.id === 'surrender')!.rows).toHaveLength(0);
  });

  test('no double after split turns Y/N cells into N', () => {
    const das = buildChart(DEFAULT_RULES).sections.find((s) => s.id === 'pairs')!;
    const nodas = buildChart({ ...DEFAULT_RULES, doubleAfterSplit: false }).sections.find((s) => s.id === 'pairs')!;
    const cell = (sec: typeof das, key: string, col: number) => sec.rows.find((r) => r.key === key)!.cells[col].code;
    expect(cell(das, 'pair-4', 3)).toBe('Y/N'); // 4-4 vs 5
    expect(cell(nodas, 'pair-4', 3)).toBe('N');
    expect(cell(das, 'pair-2', 0)).toBe('Y/N'); // 2-2 vs 2
    expect(cell(nodas, 'pair-2', 0)).toBe('N');
  });

  test('double restrictions change soft doubles', () => {
    const r: Rules = { ...DEFAULT_RULES, doubleOn: '10-11' };
    for (const u of UPCARDS) {
      expect(adviseClass(softClass(17), u, r).options.map((o) => o.action)).not.toContain('double');
      expect(adviseClass(hardClass(9), u, r).best).not.toBe('double');
    }
  });

  test('European no hole card: do not double 11 or split 8-8 into a dealer 10', () => {
    const enhc: Rules = { ...DEFAULT_RULES, hitSoft17: false, dealerPeeks: false, surrender: 'none' };
    expect(play(['6', '5'], 10, enhc)).toBe('hit');
    expect(play(['6', '5'], 10, DEFAULT_RULES)).toBe('double');
    expect(play(['8', '8'], 10, enhc)).not.toBe('split');
  });

  test('fewer decks means more doubling: 11 vs Ace under S17 is a double in one deck', () => {
    expect(play(['6', '5'], 1, { ...DEFAULT_RULES, hitSoft17: false, decks: 1 })).toBe('double');
  });
});

describe('reasons come from the engine', () => {
  test('the reason quotes the same numbers and action as the advice', () => {
    for (const cls of [hardClass(13), hardClass(16), softClass(18), pairClass(8), pairClass(5)]) {
      for (const u of UPCARDS) {
        const a = adviseClass(cls, u, DEFAULT_RULES);
        const why = explain(a);
        const verb = { hit: 'Hitting', stand: 'Standing', double: 'Doubling', split: 'Splitting', surrender: 'Surrendering' }[a.best];
        expect(why, `${classKey(cls)} vs ${u}`).toContain(`${verb} averages`);
      }
    }
  });
});
