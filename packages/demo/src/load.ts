import { beginBulkLoad, endBulkLoad, migrate, SqlPartsRepository, type SqlExecutor } from '@gomdori/sql';
import { DEFAULT_SEED, demoParts, demoReference } from './generate.ts';

const PARTS_JSON = /* sql */ `
INSERT OR IGNORE INTO parts(id, sku, mpn, gtin, brand_id, category_id, name, price_cents, currency, stock, status, evidence, rights, hold_reason, updated_at, hlc)
SELECT j.value ->> 'id', j.value ->> 'sku', j.value ->> 'mpn', j.value ->> 'gtin', j.value ->> 'brandId', j.value ->> 'categoryId',
       j.value ->> 'name', j.value ->> 'priceCents', j.value ->> 'currency', j.value ->> 'stock', j.value ->> 'status',
       j.value ->> 'evidence', j.value ->> 'rights', j.value ->> 'holdReason', j.value ->> 'updatedAt', j.value ->> 'hlc'
FROM json_each(?) j`;

const FITMENTS_JSON = /* sql */ `
INSERT OR IGNORE INTO fitments(part_id, vehicle_id, position, source_url)
SELECT j.value ->> 'partId', j.value ->> 'vehicleId', j.value ->> 'position', j.value ->> 'sourceUrl'
FROM json_each(?) j`;

export interface LoadProgress {
  phase: 'reference' | 'parts' | 'index' | 'stats' | 'done';
  done: number;
  total: number;
}

/**
 * Fill an empty catalogue with `n` synthetic parts. Works on any SqlExecutor
 * (node:sqlite for the 1M seed, sqlite-wasm/OPFS in the browser demo):
 * secondary indexes are dropped during the load and rebuilt once at the end.
 */
export async function loadDemoCatalogue(
  ex: SqlExecutor,
  n: number,
  opts: { seed?: number; batch?: number; onProgress?: (p: LoadProgress) => void } = {},
): Promise<void> {
  const seed = opts.seed ?? DEFAULT_SEED;
  const batch = opts.batch ?? 4000;
  const report = opts.onProgress ?? (() => {});
  await migrate(ex);
  const ref = demoReference(seed);
  report({ phase: 'reference', done: 0, total: n });
  await ex.transaction(async (tx) => {
    for (const b of ref.brands) await tx.run(`INSERT OR IGNORE INTO brands(id, name) VALUES (?, ?)`, [b.id, b.name]);
    for (const c of ref.categories) await tx.run(`INSERT OR IGNORE INTO categories(id, name, parent_id) VALUES (?, ?, ?)`, [c.id, c.name, c.parentId]);
    for (const v of ref.vehicles)
      await tx.run(`INSERT OR IGNORE INTO vehicles(id, make, model, year_from, year_to, engine, body, drive_side) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        v.id, v.make, v.model, v.yearFrom, v.yearTo, v.engine, v.body, v.driveSide,
      ]);
  });
  await beginBulkLoad(ex);
  let parts: unknown[] = [];
  let fits: unknown[] = [];
  let done = 0;
  const flush = async () => {
    if (!parts.length) return;
    const p = JSON.stringify(parts);
    const f = JSON.stringify(fits);
    parts = [];
    fits = [];
    await ex.transaction(async (tx) => {
      await tx.run(PARTS_JSON, [p]);
      await tx.run(FITMENTS_JSON, [f]);
    });
    report({ phase: 'parts', done, total: n });
  };
  for (const { part, fitments } of demoParts(n, ref, seed)) {
    parts.push(part);
    fits.push(...fitments);
    done++;
    if (parts.length >= batch) await flush();
  }
  await flush();
  report({ phase: 'index', done, total: n });
  await endBulkLoad(ex);
  await ex.run(`INSERT INTO meta(key, value) VALUES ('dataset', 'synthetic') ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  report({ phase: 'stats', done, total: n });
  await new SqlPartsRepository(ex).refreshStats();
  report({ phase: 'done', done, total: n });
}
