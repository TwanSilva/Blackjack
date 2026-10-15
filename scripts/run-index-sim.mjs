// Runs the index Monte Carlo on all cores and writes out/sim-indices-<rules>.json and .txt.
// Usage: npm run sim -- [shoes=20000000] [rules=h17|s17]
// The simulator is bundled from src/engine/sim/simEntry.ts first (npm run sim does that).
import { cpus } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = pathToFileURL(path.join(here, '..', 'out', 'sim-build', 'simEntry.js')).href;
const BATCHES_PER_WORKER = 10;
const MIN_N = 20000;

if (!isMainThread) {
  const sim = await import(bundle);
  const { shoes, seed, h17 } = workerData;
  const rules = { ...sim.DEFAULT_RULES, hitSoft17: h17 };
  const res = sim.simulateIndices({ rules, shoes, seed });
  parentPort.postMessage(res.map((r) => ({
    id: r.id,
    all: { n: Array.from(r.all.n), sum: Array.from(r.all.sum), sumSq: Array.from(r.all.sumSq) },
    inGame: { n: Array.from(r.inGame.n), sum: Array.from(r.inGame.sum), sumSq: Array.from(r.inGame.sumSq) },
  })));
} else {
  const totalShoes = Number(process.argv[2] ?? 20_000_000);
  const which = (process.argv[3] ?? 'h17').toLowerCase();
  const h17 = which !== 's17';
  const workers = Math.max(1, cpus().length - 1);
  const batches = workers * BATCHES_PER_WORKER;
  const perBatch = Math.ceil(totalShoes / batches);
  const sim = await import(bundle);
  const rules = { ...sim.DEFAULT_RULES, hitSoft17: h17 };
  const t0 = Date.now();
  console.log(`${which.toUpperCase()}: ${batches} batches of ${perBatch} shoes on ${workers} workers`);

  // batch results: [batch][row] -> {all, inGame}
  const results = [];
  let next = 0;
  let done = 0;
  await new Promise((resolve, reject) => {
    const launch = () => {
      if (next >= batches) return;
      const b = next++;
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { shoes: perBatch, seed: 1_000_003 * (b + 1) + (h17 ? 17 : 71), h17 } });
      w.once('message', (m) => {
        results[b] = m;
        done++;
        if (done % workers === 0 || done === batches) {
          const s = (Date.now() - t0) / 1000;
          console.log(`  ${done}/${batches} batches, ${s.toFixed(0)} s`);
        }
        if (done === batches) resolve(); else launch();
      });
      w.once('error', reject);
    };
    for (let i = 0; i < workers; i++) launch();
  });

  const BINS = sim.TC_MAX - sim.TC_MIN + 1;
  /** Pooled mean per bin, and standard error from the spread of batch means (honest under correlation). */
  function stats(rowIndex, key) {
    const out = [];
    for (let i = 0; i < BINS; i++) {
      let N = 0, S = 0, SS = 0;
      for (const r of results) { N += r[rowIndex][key].n[i]; S += r[rowIndex][key].sum[i]; SS += r[rowIndex][key].sumSq[i]; }
      if (N < 2) continue;
      const mean = S / N;
      let v = 0;
      for (const r of results) {
        const n = r[rowIndex][key].n[i];
        if (n === 0) continue;
        const mb = r[rowIndex][key].sum[i] / n;
        v += (n / N) ** 2 * (mb - mean) ** 2;
      }
      const se = Math.sqrt((v * results.length) / (results.length - 1));
      const naive = Math.sqrt(Math.max(0, SS / N - mean * mean) / N);
      out.push({ tc: i + sim.TC_MIN, n: N, mean, se, naiveSe: naive });
    }
    return out;
  }

  function read(bins) {
    const ok = bins.filter((b) => b.n >= MIN_N && b.tc > sim.TC_MIN && b.tc < sim.TC_MAX);
    let idx = -1;
    for (let i = ok.length - 1; i >= 0; i--) { if (ok[i].mean >= 0) idx = i; else break; }
    if (idx === -1) return { index: null, note: 'never wins in range' };
    if (idx === 0) return { index: null, note: `wins at every count with data (from ${ok[0].tc})` };
    const at = ok[idx];
    const below = ok[idx - 1];
    const zAt = at.mean / at.se;
    const zBelow = -below.mean / below.se;
    return { index: at.tc, at, below, zAt, zBelow, confidence: Math.min(zAt, zBelow) >= 2 ? 'clear' : 'close' };
  }

  const rows = results[0].map((r, i) => {
    const d = sim.DEVIATIONS.find((x) => x.id === r.id);
    const all = stats(i, 'all');
    const inGame = stats(i, 'inGame');
    const engine = sim.computeIndex(d, rules).index.floor;
    return { id: r.id, text: sim.describeDeviation(d), memory: d.index, engine, all: read(all), inGame: read(inGame), bins: { all, inGame } };
  });
  const seconds = (Date.now() - t0) / 1000;
  const shoes = perBatch * batches;
  mkdirSync('out', { recursive: true });
  const meta = { rules, shoes, batches, workers, seconds, minSamplesPerBin: MIN_N };
  writeFileSync(`out/sim-indices-${which}.json`, JSON.stringify({ meta, rows }, null, 1));

  const fmt = (x) => (x === null || x === undefined ? '-' : x > 0 ? `+${x}` : String(x));
  const g = (b) => (b ? `${(b.mean * 100).toFixed(2)}±${(b.se * 100).toFixed(2)}` : '-');
  const lines = [`${which.toUpperCase()} ${shoes.toLocaleString('en')} shoes, ${seconds.toFixed(0)} s. Gains per 100 bet ± 1 standard error (batch).`,
    'row        memory engine  sim(all) conf   gain@idx     gain@idx-1   | sim(in game) conf  gain@idx     gain@idx-1'];
  for (const r of rows) {
    lines.push([r.id.padEnd(10), fmt(r.memory).padEnd(6), fmt(r.engine).padEnd(7), fmt(r.all.index).padEnd(8), (r.all.confidence ?? r.all.note ?? '').padEnd(6),
      g(r.all.at).padEnd(12), g(r.all.below).padEnd(12), '|', fmt(r.inGame.index).padEnd(12), (r.inGame.confidence ?? r.inGame.note ?? '').padEnd(5),
      g(r.inGame.at).padEnd(12), g(r.inGame.below)].join(' '));
  }
  writeFileSync(`out/sim-indices-${which}.txt`, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}
