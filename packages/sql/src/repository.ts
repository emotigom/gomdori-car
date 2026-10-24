import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  decodeCursor,
  encodeCursor,
  type Brand,
  type CatalogueStats,
  type Category,
  type Change,
  type ChangeFeed,
  type FitmentRow,
  type Mutation,
  type Page,
  type Part,
  type PartPatch,
  type PartQuery,
  type PartRow,
  type PartsReader,
  type PartsWriter,
  type Vehicle,
} from '@gomdori/core';
import { one, type SqlExecutor, type SqlValue } from './executor.ts';

const PART_COLS = /* sql */ `
  p.id, p.sku, p.mpn, p.gtin, p.brand_id AS brandId, p.category_id AS categoryId, p.name,
  p.price_cents AS priceCents, p.currency, p.stock, p.status, p.evidence, p.rights,
  p.hold_reason AS holdReason, p.updated_at AS updatedAt, p.hlc`;

const ROW_COLS = /* sql */ `${PART_COLS},
  b.name AS brand, c.name AS category,
  (SELECT count(*) FROM fitments f WHERE f.part_id = p.id) AS fitmentCount`;

interface SortSpec {
  order: string;
  /** Keyset predicate given the decoded cursor. */
  after: string;
  key: (r: PartRow) => (string | number)[];
  arity: number;
}

const SORTS: Record<NonNullable<PartQuery['sort']>, SortSpec> = {
  id: { order: 'p.id ASC', after: 'p.id > ?', key: (r) => [r.id], arity: 1 },
  updated_desc: {
    order: 'p.updated_at DESC, p.id DESC',
    after: '(p.updated_at, p.id) < (?, ?)',
    key: (r) => [r.updatedAt, r.id],
    arity: 2,
  },
  price_asc: {
    order: 'p.price_cents ASC, p.id ASC',
    after: '(p.price_cents, p.id) > (?, ?)',
    key: (r) => [r.priceCents, r.id],
    arity: 2,
  },
  price_desc: {
    order: 'p.price_cents DESC, p.id DESC',
    after: '(p.price_cents, p.id) < (?, ?)',
    key: (r) => [r.priceCents, r.id],
    arity: 2,
  },
};

/**
 * Build an FTS5 MATCH expression from free text. Every token becomes a quoted
 * prefix term, so user input can never inject FTS syntax.
 */
export function ftsMatch(text: string): string | null {
  const tokens = text
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.replace(/["*^():]/g, ''))
    .filter(Boolean)
    .slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t}"*`).join(' ');
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

const STATS_TTL_MS = 60_000;

export class SqlPartsRepository implements PartsReader, PartsWriter, ChangeFeed {
  readonly ex: SqlExecutor;
  /** Share of fitments per make — picks IN vs EXISTS for make-only filters. */
  private makeShare: Map<string, number> | null = null;
  private makeShareAt = 0;
  constructor(ex: SqlExecutor) {
    this.ex = ex;
  }

  private async planHints(q: PartQuery): Promise<void> {
    if (!q.make || q.model || q.vehicleId) return;
    if (this.makeShare && Date.now() - this.makeShareAt < 600_000) return;
    // vehicles is tiny; vehicle counts per make are a good enough proxy for fitment share.
    const rows = await this.ex.all<{ make: string; n: number }>(`SELECT make, count(*) AS n FROM vehicles GROUP BY make`);
    const total = rows.reduce((a, r) => a + Number(r.n), 0) || 1;
    this.makeShare = new Map(rows.map((r) => [r.make, Number(r.n) / total]));
    this.makeShareAt = Date.now();
  }

  /** WHERE clause + params for every filter in the query contract. */
  where(q: PartQuery): { sql: string; params: SqlValue[] } {
    const w: string[] = [];
    const params: SqlValue[] = [];
    if (q.q) {
      const m = ftsMatch(q.q);
      if (m) {
        w.push('p.rid IN (SELECT rowid FROM parts_fts WHERE parts_fts MATCH ?)');
        params.push(m);
      }
    }
    const inList = (col: string, vals: SqlValue[] | undefined) => {
      if (!vals?.length) return;
      w.push(vals.length === 1 ? `${col} = ?` : `${col} IN (${placeholders(vals.length)})`);
      params.push(...vals);
    };
    inList('p.brand_id', q.brandId);
    inList('p.category_id', q.categoryId);
    inList('p.status', q.status);
    inList('p.evidence', q.evidence);
    inList('p.rights', q.rights);
    if (q.inStock) w.push('p.stock > 0');
    if (q.vehicleId) {
      w.push('p.id IN (SELECT part_id FROM fitments WHERE vehicle_id = ?)');
      params.push(q.vehicleId);
    } else if (q.make) {
      const v: string[] = ['v.make = ?'];
      params.push(q.make);
      if (q.model) {
        v.push('v.model = ?');
        params.push(q.model);
      }
      if (q.year) {
        v.push('? BETWEEN v.year_from AND v.year_to');
        params.push(q.year);
      }
      const share = this.makeShare?.get(q.make) ?? 1;
      if (q.model || share < 0.08) {
        // Narrow (one model line, or a rare make): resolve its few vehicles, then their parts via fitments_vehicle.
        w.push(`p.id IN (SELECT f.part_id FROM vehicles v JOIN fitments f ON f.vehicle_id = v.id WHERE ${v.join(' AND ')})`);
      } else {
        // Broad (a common make matches 10%+ of parts): walk parts in sort order and probe
        // each one's fitments by PK, so LIMIT stops early instead of materialising 100k+ ids.
        w.push(`EXISTS (SELECT 1 FROM fitments f JOIN vehicles v ON v.id = f.vehicle_id WHERE f.part_id = p.id AND ${v.join(' AND ')})`);
      }
    }
    return { sql: w.length ? w.join(' AND ') : '1', params };
  }

  async list(q: PartQuery): Promise<Page<PartRow>> {
    const t0 = performance.now();
    await this.planHints(q);
    const sort = SORTS[q.sort ?? 'id'];
    const limit = Math.min(Math.max(q.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const { sql: where, params } = this.where(q);
    const parts = [where];
    const cur = decodeCursor(q.cursor);
    if (cur && cur.length === sort.arity) {
      parts.push(sort.after);
      params.push(...cur);
    }
    const rows = await this.ex.all<PartRow>(
      `SELECT ${ROW_COLS}
       FROM parts p
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE ${parts.join(' AND ')}
       ORDER BY ${sort.order}
       LIMIT ?`,
      [...params, limit + 1],
    );
    const more = rows.length > limit;
    const items = more ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: more && last ? encodeCursor(sort.key(last)) : null,
      tookMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  }

  /**
   * Bounded count for a filter: exact up to `cap`, then reports `capped`.
   * Exact counts over 1M filtered rows are the classic dashboard tar-pit.
   */
  async count(q: PartQuery, cap = 10_000): Promise<{ count: number; capped: boolean; tookMs: number }> {
    const t0 = performance.now();
    await this.planHints(q);
    const { sql, params } = this.where(q);
    const r = await one<{ n: number }>(this.ex, `SELECT count(*) AS n FROM (SELECT 1 FROM parts p WHERE ${sql} LIMIT ?)`, [
      ...params,
      cap + 1,
    ]);
    const n = Number(r?.n ?? 0);
    return { count: Math.min(n, cap), capped: n > cap, tookMs: Math.round((performance.now() - t0) * 10) / 10 };
  }

  async coverage(q: PartQuery): Promise<{ categoryId: number; count: number }[]> {
    await this.planHints(q);
    const { sql, params } = this.where({ ...q, categoryId: undefined, cursor: undefined });
    const rows = await this.ex.all<{ categoryId: number; count: number }>(
      `SELECT p.category_id AS categoryId, count(*) AS count FROM parts p WHERE ${sql} GROUP BY p.category_id`,
      params,
    );
    return rows.map((r) => ({ categoryId: Number(r.categoryId), count: Number(r.count) }));
  }

  async get(id: string): Promise<PartRow | null> {
    return one<PartRow>(
      this.ex,
      `SELECT ${ROW_COLS} FROM parts p JOIN brands b ON b.id = p.brand_id JOIN categories c ON c.id = p.category_id WHERE p.id = ?`,
      [id],
    );
  }

  async fitments(partId: string): Promise<FitmentRow[]> {
    const rows = await this.ex.all<Record<string, unknown>>(
      `SELECT f.part_id, f.vehicle_id, f.position, f.source_url,
              v.make, v.model, v.year_from, v.year_to, v.engine, v.body, v.drive_side
       FROM fitments f JOIN vehicles v ON v.id = f.vehicle_id
       WHERE f.part_id = ? ORDER BY v.make, v.model, v.year_from LIMIT 500`,
      [partId],
    );
    return rows.map((r) => ({
      partId: String(r.part_id),
      vehicleId: Number(r.vehicle_id),
      position: String(r.position),
      sourceUrl: (r.source_url as string | null) ?? null,
      vehicle: {
        id: Number(r.vehicle_id),
        make: String(r.make),
        model: String(r.model),
        yearFrom: Number(r.year_from),
        yearTo: Number(r.year_to),
        engine: String(r.engine),
        body: String(r.body),
        driveSide: r.drive_side as Vehicle['driveSide'],
      },
    }));
  }

  async brands(): Promise<Brand[]> {
    return this.ex.all<Brand>(`SELECT id, name FROM brands ORDER BY name`);
  }

  async categories(): Promise<Category[]> {
    return this.ex.all<Category>(`SELECT id, name, parent_id AS parentId FROM categories ORDER BY name`);
  }

  async vehicles(filter: { make?: string; model?: string; limit?: number }): Promise<Vehicle[]> {
    const w: string[] = [];
    const p: SqlValue[] = [];
    if (filter.make) {
      w.push('make = ?');
      p.push(filter.make);
    }
    if (filter.model) {
      w.push('model = ?');
      p.push(filter.model);
    }
    return this.ex.all<Vehicle>(
      `SELECT id, make, model, year_from AS yearFrom, year_to AS yearTo, engine, body, drive_side AS driveSide
       FROM vehicles ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY make, model, year_from LIMIT ?`,
      [...p, Math.min(filter.limit ?? 500, 5000)],
    );
  }

  /** Distinct makes / models for the vehicle picker (small: vehicles table is ~10³–10⁴ rows). */
  async makes(): Promise<string[]> {
    const r = await this.ex.all<{ make: string }>(`SELECT DISTINCT make FROM vehicles ORDER BY make`);
    return r.map((x) => x.make);
  }

  async models(make: string): Promise<string[]> {
    const r = await this.ex.all<{ model: string }>(`SELECT DISTINCT model FROM vehicles WHERE make = ? ORDER BY model`, [make]);
    return r.map((x) => x.model);
  }

  /** Cached aggregate snapshot; recomputed at most once per TTL. */
  async stats(opts: { maxAgeMs?: number } = {}): Promise<CatalogueStats> {
    const maxAge = opts.maxAgeMs ?? STATS_TTL_MS;
    const cached = await one<{ json: string; computed_at: number }>(this.ex, `SELECT json, computed_at FROM stats_cache WHERE key = 'catalogue'`);
    if (cached && Date.now() - Number(cached.computed_at) < maxAge) {
      const s = JSON.parse(cached.json) as CatalogueStats;
      if ('contentReady' in s) return s; // older snapshot shape → recompute
    }
    return this.refreshStats();
  }

  async refreshStats(): Promise<CatalogueStats> {
    const group = async (col: string) => {
      const r = await this.ex.all<{ k: string; n: number }>(`SELECT ${col} AS k, count(*) AS n FROM parts GROUP BY ${col}`);
      return Object.fromEntries(r.map((x) => [x.k, Number(x.n)]));
    };
    const byStatus = await group('status');
    const byEvidence = await group('evidence');
    const byRights = await group('rights');
    const byCategory = (
      await this.ex.all<{ id: number; name: string; count: number }>(
        `SELECT c.id, c.name, x.n AS count FROM (SELECT category_id, count(*) AS n FROM parts GROUP BY category_id) x
         JOIN categories c ON c.id = x.category_id ORDER BY x.n DESC`,
      )
    ).map((r) => ({ ...r, count: Number(r.count) }));
    const byBrand = (
      await this.ex.all<{ id: number; name: string; count: number }>(
        `SELECT b.id, b.name, x.n AS count FROM (SELECT brand_id, count(*) AS n FROM parts GROUP BY brand_id) x
         JOIN brands b ON b.id = x.brand_id ORDER BY x.n DESC`,
      )
    ).map((r) => ({ ...r, count: Number(r.count) }));
    const ready = await one<{ n: number }>(
      this.ex,
      `SELECT count(*) AS n FROM parts WHERE status = 'active' AND evidence = 'A' AND rights IN ('own','licensed')`,
    );
    const fit = await one<{ n: number }>(this.ex, `SELECT count(*) AS n FROM fitments`);
    const veh = await one<{ n: number }>(this.ex, `SELECT count(*) AS n FROM vehicles`);
    const stats: CatalogueStats = {
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus,
      byEvidence,
      byRights,
      byCategory,
      byBrand,
      contentReady: Number(ready?.n ?? 0),
      fitments: Number(fit?.n ?? 0),
      vehicles: Number(veh?.n ?? 0),
      computedAt: Date.now(),
    };
    await this.ex.run(
      `INSERT INTO stats_cache(key, json, computed_at) VALUES ('catalogue', ?, ?)
       ON CONFLICT(key) DO UPDATE SET json = excluded.json, computed_at = excluded.computed_at`,
      [JSON.stringify(stats), stats.computedAt],
    );
    return stats;
  }

  // ---------------------------------------------------------------- writes

  /**
   * Row-level last-writer-wins on HLC. Idempotent per mutation id, so a
   * device can safely re-push its outbox after a dropped connection.
   */
  async apply(mutations: Mutation[]) {
    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];
    await this.ex.transaction(async (tx) => {
      for (const m of mutations) {
        const seen = await one(tx, `SELECT 1 AS x FROM applied_mutations WHERE id = ?`, [m.id]);
        if (seen) {
          accepted.push(m.id);
          continue;
        }
        const cur = await one<{ hlc: string }>(tx, `SELECT hlc FROM parts WHERE id = ?`, [m.entityId]);
        if (!cur) {
          rejected.push({ id: m.id, reason: 'not_found' });
          continue;
        }
        if (m.hlc <= cur.hlc) {
          rejected.push({ id: m.id, reason: 'stale' });
          continue;
        }
        const { sql, params } = patchSql(m.patch);
        if (!sql) {
          rejected.push({ id: m.id, reason: 'empty_patch' });
          continue;
        }
        await tx.run(`UPDATE parts SET ${sql}, hlc = ?, updated_at = ? WHERE id = ?`, [...params, m.hlc, Date.now(), m.entityId]);
        await tx.run(`INSERT INTO changes(entity, entity_id, op, hlc, ts) VALUES ('part', ?, 'upsert', ?, ?)`, [m.entityId, m.hlc, Date.now()]);
        await tx.run(`INSERT INTO applied_mutations(id, applied_at) VALUES (?, ?)`, [m.id, Date.now()]);
        accepted.push(m.id);
      }
    });
    return { accepted, rejected };
  }

  /** Latest state of every part changed after `since` (log is compacted on read). */
  async changesSince(since: number, limit: number): Promise<{ changes: Change[]; head: number }> {
    const head = Number((await one<{ s: number }>(this.ex, `SELECT coalesce(max(seq), 0) AS s FROM changes`))?.s ?? 0);
    const rows = await this.ex.all<Part & { seq: number; op: 'upsert' | 'delete'; changeHlc: string; entityId: string }>(
      `SELECT x.seq, x.op, x.hlc AS changeHlc, x.entity_id AS entityId, ${PART_COLS}
       FROM (SELECT max(seq) AS seq, entity_id, op, hlc FROM changes WHERE seq > ? GROUP BY entity_id ORDER BY seq LIMIT ?) x
       LEFT JOIN parts p ON p.id = x.entity_id
       ORDER BY x.seq`,
      [since, Math.min(limit, 5000)],
    );
    return {
      head,
      changes: rows.map(({ seq, op, changeHlc, entityId, ...row }) => ({
        seq: Number(seq),
        entity: 'part',
        entityId,
        op: row.id ? op : 'delete',
        row: row.id ? (row as Part) : null,
        hlc: changeHlc,
      })),
    };
  }
}

const PATCH_COLS: Record<keyof PartPatch, string> = {
  status: 'status',
  holdReason: 'hold_reason',
  evidence: 'evidence',
  rights: 'rights',
  priceCents: 'price_cents',
  stock: 'stock',
  name: 'name',
};

export function patchSql(patch: PartPatch): { sql: string; params: SqlValue[] } {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const [k, col] of Object.entries(PATCH_COLS) as [keyof PartPatch, string][]) {
    if (k in patch) {
      sets.push(`${col} = ?`);
      params.push((patch[k] ?? null) as SqlValue);
    }
  }
  return { sql: sets.join(', '), params };
}
