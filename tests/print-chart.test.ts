// Writes computed charts and the closest decisions to out/charts.txt. Run with `npm run chart`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import {
  DEFAULT_RULES, type Rules, UPCARDS, allClasses, adviseClass, buildChart, classLabel, pipName,
} from '../src/engine';

function print(rules: Rules, name: string): string {
  const chart = buildChart(rules);
  const lines = [`=== ${name}: ${chart.rulesLine}`];
  const head = '       ' + chart.upcards.map((u) => (u === 1 ? 'A' : String(u)).padStart(4)).join('');
  for (const s of chart.sections) {
    lines.push(`-- ${s.title}`, head);
    if (s.rows.length === 0) lines.push(`   ${s.empty}`);
    for (const r of s.rows) lines.push(r.label.padStart(6) + ' ' + r.cells.map((c) => (c.code || '.').padStart(4)).join(''));
  }
  return lines.join('\n');
}

function closeCalls(rules: Rules, limit = 0.005): string {
  const lines = [`-- Decisions within ${limit * 100} per 100 bet`];
  for (const cls of allClasses()) {
    for (const up of UPCARDS) {
      const a = adviseClass(cls, up, rules);
      const [b, s] = a.options;
      if (s && b.ev - s.ev < limit) {
        lines.push(`${classLabel(cls)} vs ${pipName(up)}: ${b.action} ${(b.ev * 100).toFixed(2)} vs ${s.action} ${(s.ev * 100).toFixed(2)}`);
      }
    }
  }
  return lines.join('\n');
}

test('print charts', () => {
  const out = [
    print(DEFAULT_RULES, 'Default'),
    closeCalls(DEFAULT_RULES),
    print({ ...DEFAULT_RULES, hitSoft17: false }, 'S17'),
    closeCalls({ ...DEFAULT_RULES, hitSoft17: false }),
  ];
  mkdirSync('out', { recursive: true });
  writeFileSync('out/charts.txt', out.join('\n\n') + '\n');
});
