import type { Action } from '../actions';
import { type Pip, pipName } from '../cards';
import { type Rules, rulesDescription, strategyKey } from '../rules';
import {
  type HandClass, HARD_TOTALS, PAIR_PIPS, SOFT_TOTALS, UPCARDS, allClasses, classKey, classLabel,
  hardClass, pairClass, rowLabel, softClass,
} from './classes';
import { type OptionEval, evaluateClass } from './evaluate';
import { type Advice, INSURANCE_INDEX, adviseClass } from './oracle';

export type PlayCode = 'H' | 'S' | 'D' | 'Ds';
export type ChartCode = PlayCode | 'Y' | 'N' | 'Y/N' | 'SUR' | '';

export interface ChartCell {
  upcard: Pip;
  code: ChartCode;
  /** The best action overall for this cell (surrender included), the same answer the drill uses. */
  best: Action;
  /** Pairs only: how to play the hand when it isn't split. */
  ifNotSplit?: PlayCode;
  /** Screen-reader label, for example "Hard 13 versus 5: stand". */
  label: string;
}

export interface ChartRow {
  key: string;
  cls: HandClass;
  label: string;
  cells: ChartCell[];
}

export type SectionId = 'hard' | 'soft' | 'pairs' | 'surrender';

export interface ChartSection {
  id: SectionId;
  title: string;
  rows: ChartRow[];
  /** Shown when the section has no rows. */
  empty?: string;
}

export interface StrategyChart {
  rulesLine: string;
  upcards: readonly Pip[];
  sections: ChartSection[];
  insurance: string;
  legend: { code: ChartCode; meaning: string }[];
}

export const CODE_MEANING: Record<Exclude<ChartCode, ''>, string> = {
  H: 'Hit',
  S: 'Stand',
  D: 'Double, or hit if you can’t',
  Ds: 'Double, or stand if you can’t',
  Y: 'Split',
  N: 'Don’t split, play the total',
  'Y/N': 'Split only if double after split is allowed',
  SUR: 'Surrender, if allowed',
};

const CODE_SPOKEN: Record<Exclude<ChartCode, ''>, string> = {
  H: 'hit',
  S: 'stand',
  D: 'double, or hit if not allowed',
  Ds: 'double, or stand if not allowed',
  Y: 'split',
  N: 'don’t split',
  'Y/N': 'split if double after split is allowed',
  SUR: 'surrender',
};

function ev(options: OptionEval[], action: Action): number {
  return options.find((o) => o.action === action)?.ev ?? -Infinity;
}

/** Best play when only hit, stand and double are on the table. */
export function playCode(options: OptionEval[]): PlayCode {
  const hit = ev(options, 'hit');
  const stand = ev(options, 'stand');
  const dbl = ev(options, 'double');
  if (dbl > hit && dbl > stand) return stand > hit ? 'Ds' : 'D';
  return stand > hit ? 'S' : 'H';
}

function bestNonSplit(options: OptionEval[]): number {
  return Math.max(ev(options, 'hit'), ev(options, 'stand'), ev(options, 'double'));
}

function label(cls: HandClass, up: Pip, code: ChartCode, ifNotSplit?: PlayCode): string {
  const head = `${classLabel(cls)} versus ${pipName(up)}`;
  if (code === '') return `${head}: no surrender`;
  if (code === 'N' && ifNotSplit) return `${head}: don’t split, ${CODE_SPOKEN[ifNotSplit]}`;
  return `${head}: ${CODE_SPOKEN[code]}`;
}

function playRow(cls: HandClass, rules: Rules): ChartRow {
  return {
    key: classKey(cls),
    cls,
    label: rowLabel(cls),
    cells: UPCARDS.map((up) => {
      const options = evaluateClass(cls, up, rules).options;
      const code = playCode(options);
      return { upcard: up, code, best: options[0].action, label: label(cls, up, code) };
    }),
  };
}

function pairRow(pip: Pip, rules: Rules): ChartRow {
  const cls = pairClass(pip);
  const noDas: Rules = { ...rules, doubleAfterSplit: false };
  return {
    key: classKey(cls),
    cls,
    label: rowLabel(cls),
    cells: UPCARDS.map((up) => {
      const options = evaluateClass(cls, up, rules).options;
      const ifNotSplit = playCode(options);
      let code: ChartCode = 'N';
      if (ev(options, 'split') > bestNonSplit(options)) {
        code = 'Y';
        if (rules.doubleAfterSplit) {
          const without = evaluateClass(cls, up, noDas).options;
          if (!(ev(without, 'split') > bestNonSplit(without))) code = 'Y/N';
        }
      }
      return { upcard: up, code, best: options[0].action, ifNotSplit, label: label(cls, up, code, ifNotSplit) };
    }),
  };
}

function surrenderRows(rules: Rules): ChartRow[] {
  if (rules.surrender !== 'late') return [];
  const rows: ChartRow[] = [];
  for (const cls of allClasses()) {
    const cells = UPCARDS.map((up): ChartCell => {
      const best = evaluateClass(cls, up, rules).options[0].action;
      const code: ChartCode = best === 'surrender' ? 'SUR' : '';
      return { upcard: up, code, best, label: label(cls, up, code) };
    });
    if (cells.some((c) => c.code === 'SUR')) {
      rows.push({ key: classKey(cls), cls, label: rowLabel(cls), cells });
    }
  }
  return rows;
}

const chartCache = new Map<string, StrategyChart>();

/** Builds the full basic strategy chart for a rule set. Every cell comes from the EV engine. */
export function buildChart(rules: Rules): StrategyChart {
  const key = strategyKey(rules);
  const cached = chartCache.get(key);
  if (cached) return cached;
  const legendCodes: Exclude<ChartCode, ''>[] = ['H', 'S', 'D', 'Ds', 'Y', 'N'];
  if (rules.doubleAfterSplit) legendCodes.push('Y/N');
  if (rules.surrender === 'late') legendCodes.push('SUR');
  const chart: StrategyChart = {
    rulesLine: rulesDescription(rules),
    upcards: UPCARDS,
    sections: [
      { id: 'hard', title: 'Hard totals', rows: HARD_TOTALS.map((t) => playRow(hardClass(t), rules)) },
      { id: 'soft', title: 'Soft totals', rows: SOFT_TOTALS.map((t) => playRow(softClass(t), rules)) },
      { id: 'pairs', title: 'Pairs', rows: PAIR_PIPS.map((p) => pairRow(p, rules)) },
      {
        id: 'surrender',
        title: 'Surrender',
        rows: surrenderRows(rules),
        empty: rules.surrender === 'late'
          ? 'Surrender is never the best play under these rules.'
          : 'Surrender is not allowed under these rules.',
      },
    ],
    insurance: `Insurance: don’t take it (the count can change this at true count +${INSURANCE_INDEX} or higher)`,
    legend: legendCodes.map((code) => ({ code, meaning: CODE_MEANING[code] })),
  };
  chartCache.set(key, chart);
  return chart;
}

/** The action a chart reader would take for a fresh two-card hand, reading surrender first. */
export function chartAction(chart: StrategyChart, cls: HandClass, upcard: Pip): Action {
  const key = classKey(cls);
  const col = chart.upcards.indexOf(upcard);
  const section = (id: SectionId) => chart.sections.find((s) => s.id === id)!;
  const sur = section('surrender').rows.find((r) => r.key === key);
  if (sur && sur.cells[col].code === 'SUR') return 'surrender';
  const fromPlay = (code: ChartCode): Action =>
    code === 'H' ? 'hit' : code === 'S' ? 'stand' : 'double';
  if (cls.kind === 'pair') {
    const cell = section('pairs').rows.find((r) => r.key === key)!.cells[col];
    if (cell.code === 'Y' || cell.code === 'Y/N') return 'split';
    return fromPlay(cell.ifNotSplit!);
  }
  const cell = section(cls.kind).rows.find((r) => r.key === key)!.cells[col];
  return fromPlay(cell.code);
}

/** All decisions in the chart, for consistency checks. */
export function everyCell(rules: Rules): Advice[] {
  return allClasses().flatMap((cls) => UPCARDS.map((up) => adviseClass(cls, up, rules)));
}
