// Writes the computed index table next to the memory table to out/indices.txt. Run with `npm run indices`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import {
  type ComputedIndex, DEFAULT_RULES, DEVIATIONS, type Rules, adviseClass, computeIndex, describeDeviation,
} from '../src/engine';

const H17 = DEFAULT_RULES;
const S17: Rules = { ...DEFAULT_RULES, hitSoft17: false };

function idx(r: ComputedIndex): string {
  if (r.regime === 'not-allowed') return 'n/a';
  if (r.regime === 'always') return 'always';
  if (r.regime === 'never') return 'never';
  const n = r.index.floor;
  return n === null ? '?' : n > 0 ? `+${n}` : String(n);
}

function cross(r: ComputedIndex): string {
  return r.crossing === null ? '-' : r.crossing.toFixed(2);
}

test('print computed indices', () => {
  const head = ['row', 'memory', 'H17 floor', 'H17 crossing', 'H17 @2 decks', 'H17 @6 decks', 'S17 floor', 'S17 crossing', 'H17 basic play'];
  const rows: string[][] = [];
  const json: unknown[] = [];
  for (const d of DEVIATIONS) {
    const h = computeIndex(d, H17);
    const h2 = computeIndex(d, H17, { decksRemaining: 2 });
    const h6 = computeIndex(d, H17, { decksRemaining: 6 });
    const s = computeIndex(d, S17);
    const mem = d.index > 0 ? `+${d.index}` : String(d.index);
    const basic = d.hand ? adviseClass(d.hand, d.upcard, H17).best : 'no insurance';
    rows.push([d.id, mem, idx(h), cross(h), idx(h2), idx(h6), idx(s), cross(s), basic]);
    json.push({ id: d.id, text: describeDeviation(d), memory: d.index, h17: h.index.floor, h17Crossing: h.crossing, h17Regime: h.regime, s17: s.index.floor, s17Crossing: s.crossing, s17Regime: s.regime, h17at2: h2.index.floor, h17at6: h6.index.floor, h17Basic: basic });
  }
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  const out = [line(head), ...rows.map(line)].join('\n');
  mkdirSync('out', { recursive: true });
  writeFileSync('out/indices.txt', `${out}\n`);
  writeFileSync('out/indices.json', JSON.stringify(json, null, 2));
}, 300_000);
