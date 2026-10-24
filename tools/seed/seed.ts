/**
 * Synthetic catalogue generator — proves the schema at production scale.
 *
 *   npm run seed                              # 1,000,000 parts → data/parts.db
 *   npm run seed -- --parts=50000 --out=data/small.db
 *
 * Deterministic (seeded PRNG): every run and every machine produce the same
 * catalogue. The browser demo uses the same generator (@gomdori/demo).
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_SEED, loadDemoCatalogue } from '@gomdori/demo';
import { NodeSqliteExecutor } from '@gomdori/sql/node';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? 'true'];
    }),
);
const N = Number(args.parts ?? 1_000_000);
const OUT = String(args.out ?? 'data/parts.db');
const SEED = Number(args.seed ?? DEFAULT_SEED);

mkdirSync(dirname(OUT), { recursive: true });
for (const s of ['', '-wal', '-shm']) rmSync(OUT + s, { force: true });

const t0 = performance.now();
const ex = new NodeSqliteExecutor(OUT);
await ex.exec(`PRAGMA synchronous = OFF; PRAGMA cache_size = -262144;`);
let last = 0;
await loadDemoCatalogue(ex, N, {
  seed: SEED,
  batch: 10_000,
  onProgress: (p) => {
    if (p.phase === 'parts' && p.done - last < 50_000 && p.done < N) return;
    last = p.done;
    process.stdout.write(`\r  ${p.phase.padEnd(9)} ${p.done.toLocaleString()} / ${p.total.toLocaleString()}   `);
  },
});
await ex.exec('PRAGMA optimize;');
const stats = (await ex.all<{ json: string }>(`SELECT json FROM stats_cache WHERE key = 'catalogue'`))[0];
ex.close();
const s = stats ? JSON.parse(stats.json) : null;
console.log(`\n  ${s?.total?.toLocaleString()} parts · ${s?.fitments?.toLocaleString()} fitments · ${s?.vehicles} vehicles`);
console.log(`  done → ${OUT} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
