/**
 * Query latency benchmark against a seeded catalogue.
 *   npm run bench                    # data/parts.db
 *   npm run bench -- --db=data/small.db
 *
 * Each case runs warm (5×) and reports p50 / max. Deep-page cases walk the
 * keyset cursor to prove page N costs the same as page 1.
 */
import { SqlPartsRepository, type SqlValue } from '@gomdori/sql';
import { NodeSqliteExecutor } from '@gomdori/sql/node';
import type { PartQuery } from '@gomdori/core';

const arg = process.argv.find((a) => a.startsWith('--db='));
const db = arg ? arg.slice(5) : 'data/parts.db';
const ex = new NodeSqliteExecutor(db, { readOnly: true });
const repo = new SqlPartsRepository(ex);

const stats = await repo.stats({ maxAgeMs: Number.POSITIVE_INFINITY });
const topCat = stats.byCategory[0]!.id;
const topBrand = stats.byBrand[0]!.id;
const sample = (await ex.all<{ mpn: string; vehicle_id: number }>(
  `SELECT p.mpn, f.vehicle_id FROM parts p JOIN fitments f ON f.part_id = p.id WHERE p.rid = ?`,
  [Math.floor(stats.total / 2)] as SqlValue[],
))[0];

const cases: [string, PartQuery][] = [
  ['list · first page (100)', { limit: 100 }],
  ['list · category filter', { categoryId: [topCat], limit: 100 }],
  ['list · brand + status=hold', { brandId: [topBrand], status: ['hold'], limit: 100 }],
  ['list · rights=unknown & evidence=A', { rights: ['unknown'], evidence: ['A'], limit: 100 }],
  ['list · sort updated_desc', { sort: 'updated_desc', limit: 100 }],
  ['list · sort price_asc + category', { sort: 'price_asc', categoryId: [topCat], limit: 100 }],
  ['search · text "brake pads"', { q: 'brake pads', limit: 100 }],
  ['search · MPN prefix', { q: sample?.mpn.slice(0, 5) ?? 'RYC', limit: 50 }],
  ['search · text + category', { q: 'bosch', categoryId: [topCat], limit: 100 }],
  ['fitment · vehicle id', { vehicleId: sample?.vehicle_id ?? 1, limit: 100 }],
  ['fitment · make/model/year', { make: 'Toyota', model: 'HiLux', year: 2018, limit: 100 }],
];

async function time(fn: () => Promise<unknown>, n = 5) {
  const ts: number[] = [];
  await fn();
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn();
    ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  return { p50: ts[Math.floor(n / 2)]!, max: ts[n - 1]! };
}

console.log(`\n${db}: ${stats.total.toLocaleString()} parts, ${stats.fitments.toLocaleString()} fitments\n`);
const pad = (s: string, n: number) => s.padEnd(n);
console.log(pad('case', 40), pad('rows', 6), pad('p50 ms', 9), 'max ms');
for (const [name, q] of cases) {
  let rows = 0;
  const t = await time(async () => {
    rows = (await repo.list(q)).items.length;
  });
  console.log(pad(name, 40), pad(String(rows), 6), pad(t.p50.toFixed(1), 9), t.max.toFixed(1));
}

// Deep keyset paging: walk 50 pages, report the 50th page's cost.
let cursor: string | null = null;
for (let i = 0; i < 49; i++) cursor = (await repo.list({ limit: 100, categoryId: [topCat], cursor })).nextCursor;
const deep = await time(() => repo.list({ limit: 100, categoryId: [topCat], cursor }));
console.log(pad('list · page 50 via cursor (category)', 40), pad('100', 6), pad(deep.p50.toFixed(1), 9), deep.max.toFixed(1));

const cnt = await time(() => repo.count({ categoryId: [topCat] }));
console.log(pad('count · capped at 10k', 40), pad('-', 6), pad(cnt.p50.toFixed(1), 9), cnt.max.toFixed(1));
const st = await time(() => repo.stats({ maxAgeMs: Number.POSITIVE_INFINITY }));
console.log(pad('stats · cached snapshot', 40), pad('-', 6), pad(st.p50.toFixed(1), 9), st.max.toFixed(1));
const fit = await time(async () => repo.fitments((await repo.list({ limit: 1 })).items[0]!.id));
console.log(pad('fitments for one part', 40), pad('-', 6), pad(fit.p50.toFixed(1), 9), fit.max.toFixed(1));
ex.close();
