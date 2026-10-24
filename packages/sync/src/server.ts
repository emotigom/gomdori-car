import type { Fitment, Part } from '@gomdori/core';
import { decodeCursor, encodeCursor } from '@gomdori/core';
import type { SqlPartsRepository, SqlValue } from '@gomdori/sql';
import type { SnapshotPage, SyncScope } from './protocol.ts';

const PART_COLS = `p.id, p.sku, p.mpn, p.gtin, p.brand_id AS brandId, p.category_id AS categoryId, p.name,
  p.price_cents AS priceCents, p.currency, p.stock, p.status, p.evidence, p.rights,
  p.hold_reason AS holdReason, p.updated_at AS updatedAt, p.hlc`;

/** Server half of SNAPSHOT: one keyset page of raw rows + their fitments. */
export async function snapshotPage(repo: SqlPartsRepository, scope: SyncScope, cursor: string | null, limit: number): Promise<SnapshotPage> {
  const ex = repo.ex;
  const head = Number((await ex.all<{ s: number }>(`SELECT coalesce(max(seq), 0) AS s FROM changes`))[0]?.s ?? 0);
  const { sql, params } = repo.where(scope);
  const after = decodeCursor(cursor);
  const where = after ? `${sql} AND p.id > ?` : sql;
  const p: SqlValue[] = after ? [...params, String(after[0])] : params;
  const lim = Math.min(Math.max(limit, 100), 5000);
  const parts = await ex.all<Part>(`SELECT ${PART_COLS} FROM parts p WHERE ${where} ORDER BY p.id LIMIT ?`, [...p, lim + 1]);
  const more = parts.length > lim;
  if (more) parts.pop();
  let fitments: Fitment[] = [];
  if (parts.length) {
    const cols = `part_id AS partId, vehicle_id AS vehicleId, position, source_url AS sourceUrl`;
    const unscoped = sql === '1';
    if (unscoped) {
      // Whole-catalogue scope: ids are contiguous, so one PK range scan.
      fitments = await ex.all<Fitment>(`SELECT ${cols} FROM fitments WHERE part_id BETWEEN ? AND ?`, [
        parts[0]!.id,
        parts[parts.length - 1]!.id,
      ]);
    } else {
      // Scoped: ids are sparse. Chunk IN lists at 100 (Cloudflare D1's bind limit).
      for (let i = 0; i < parts.length; i += 100) {
        const ids = parts.slice(i, i + 100).map((x) => x.id);
        fitments.push(
          ...(await ex.all<Fitment>(`SELECT ${cols} FROM fitments WHERE part_id IN (${ids.map(() => '?').join(',')})`, ids)),
        );
      }
    }
  }
  const page: SnapshotPage = {
    parts,
    fitments,
    nextCursor: more ? encodeCursor([parts[parts.length - 1]!.id]) : null,
    head,
  };
  if (!cursor) {
    page.ref = {
      brands: await repo.brands(),
      categories: await repo.categories(),
      vehicles: await repo.vehicles({ limit: 5000 }),
    };
  }
  return page;
}
