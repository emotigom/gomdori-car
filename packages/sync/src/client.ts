import { Hlc, ulid, type Change, type Mutation, type Part, type PartPatch } from '@gomdori/core';
import { beginBulkLoad, endBulkLoad, migrate, one, patchSql, type SqlExecutor } from '@gomdori/sql';
import { scopeKey, type SnapshotPage, type SyncScope, type SyncTransport } from './protocol.ts';

const LOCAL_DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (
  id         TEXT PRIMARY KEY,
  entity_id  TEXT NOT NULL,
  patch      TEXT NOT NULL,
  hlc        TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_entity ON outbox(entity_id, hlc);
`;

const UPSERT_PART = /* sql */ `
INSERT INTO parts(id, sku, mpn, gtin, brand_id, category_id, name, price_cents, currency, stock, status, evidence, rights, hold_reason, updated_at, hlc)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  sku = excluded.sku, mpn = excluded.mpn, gtin = excluded.gtin, brand_id = excluded.brand_id,
  category_id = excluded.category_id, name = excluded.name, price_cents = excluded.price_cents,
  currency = excluded.currency, stock = excluded.stock, status = excluded.status, evidence = excluded.evidence,
  rights = excluded.rights, hold_reason = excluded.hold_reason, updated_at = excluded.updated_at, hlc = excluded.hlc
WHERE excluded.hlc > parts.hlc`;

const BULK_UPSERT_PARTS = /* sql */ `
INSERT INTO parts(id, sku, mpn, gtin, brand_id, category_id, name, price_cents, currency, stock, status, evidence, rights, hold_reason, updated_at, hlc)
SELECT j.value ->> 'id', j.value ->> 'sku', j.value ->> 'mpn', j.value ->> 'gtin', j.value ->> 'brandId', j.value ->> 'categoryId',
       j.value ->> 'name', j.value ->> 'priceCents', j.value ->> 'currency', j.value ->> 'stock', j.value ->> 'status',
       j.value ->> 'evidence', j.value ->> 'rights', j.value ->> 'holdReason', j.value ->> 'updatedAt', j.value ->> 'hlc'
FROM json_each(?) j WHERE true
ON CONFLICT(id) DO UPDATE SET
  sku = excluded.sku, mpn = excluded.mpn, gtin = excluded.gtin, brand_id = excluded.brand_id,
  category_id = excluded.category_id, name = excluded.name, price_cents = excluded.price_cents,
  currency = excluded.currency, stock = excluded.stock, status = excluded.status, evidence = excluded.evidence,
  rights = excluded.rights, hold_reason = excluded.hold_reason, updated_at = excluded.updated_at, hlc = excluded.hlc
WHERE excluded.hlc > parts.hlc`;

const BULK_INSERT_FITMENTS = /* sql */ `
INSERT OR IGNORE INTO fitments(part_id, vehicle_id, position, source_url)
SELECT j.value ->> 'partId', j.value ->> 'vehicleId', j.value ->> 'position', j.value ->> 'sourceUrl'
FROM json_each(?) j`;

export interface SyncProgress {
  scope: string;
  phase: 'snapshot' | 'changes' | 'push' | 'idle';
  rows: number;
  seq: number;
  pending: number;
}

/**
 * Device-side replica. Owns a local SQLite (sqlite-wasm/OPFS in the browser,
 * node:sqlite in tests or desktop shells) that has the *same schema* as the
 * cloud, so `SqlPartsRepository` reads it with zero translation.
 *
 * Writes are local-first: applied to the replica immediately, queued in the
 * outbox, pushed when online. Conflicts resolve by row-level HLC LWW, the same
 * rule the server applies, so every node converges.
 */
export class SyncClient {
  readonly ex: SqlExecutor;
  readonly transport: SyncTransport;
  readonly hlc: Hlc;
  onProgress: (p: SyncProgress) => void = () => {};

  constructor(ex: SqlExecutor, transport: SyncTransport, nodeId: string) {
    this.ex = ex;
    this.transport = transport;
    this.hlc = new Hlc(nodeId);
  }

  async init(): Promise<void> {
    await this.ex.exec(LOCAL_DDL);
    // A bulk load interrupted by a closed tab leaves indexes dropped: finish it.
    if (await this.getState('bulk')) await this.finishBulk();
    await migrate(this.ex);
  }

  private async finishBulk(): Promise<void> {
    await endBulkLoad(this.ex);
    await this.ex.run(`DELETE FROM sync_state WHERE key = 'bulk'`);
  }

  private async getState(key: string): Promise<string | null> {
    return (await one<{ value: string }>(this.ex, `SELECT value FROM sync_state WHERE key = ?`, [key]))?.value ?? null;
  }
  private async setState(key: string, value: string): Promise<void> {
    await this.ex.run(`INSERT INTO sync_state(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value]);
  }

  async seq(): Promise<number> {
    return Number((await this.getState('seq')) ?? 0);
  }

  async scopes(): Promise<{ key: string; done: boolean; rows: number }[]> {
    const rows = await this.ex.all<{ key: string; value: string }>(`SELECT key, value FROM sync_state WHERE key LIKE 'scope:%'`);
    return rows.map((r) => ({ key: r.key.slice(6), ...(JSON.parse(r.value) as { done: boolean; rows: number }) }));
  }

  async pendingCount(): Promise<number> {
    return Number((await one<{ n: number }>(this.ex, `SELECT count(*) AS n FROM outbox`))?.n ?? 0);
  }

  /** Download (or resume downloading) a scope. Safe to interrupt at any page. */
  async replicate(scope: SyncScope, pageSize = 2000, signal?: AbortSignal): Promise<void> {
    const key = scopeKey(scope);
    const stateKey = `scope:${key}`;
    const st = JSON.parse((await this.getState(stateKey)) ?? '{"done":false,"rows":0,"cursor":null}') as {
      done: boolean;
      rows: number;
      cursor: string | null;
      head?: number;
    };
    if (st.done) return;
    // First download into an empty replica: load without secondary indexes.
    const empty = !(await one(this.ex, `SELECT 1 AS x FROM parts LIMIT 1`));
    if (empty) {
      await beginBulkLoad(this.ex);
      await this.setState('bulk', '1');
    }
    let cursor = st.cursor;
    let firstHead = st.head;
    do {
      if (signal?.aborted) {
        if (await this.getState('bulk')) await this.finishBulk();
        return;
      }
      const page = await this.transport.snapshot(scope, cursor, pageSize);
      firstHead ??= page.head;
      await this.applySnapshot(page);
      cursor = page.nextCursor;
      st.rows += page.parts.length;
      await this.setState(stateKey, JSON.stringify({ done: !cursor, rows: st.rows, cursor, head: firstHead }));
      this.onProgress({ scope: key, phase: 'snapshot', rows: st.rows, seq: firstHead, pending: 0 });
    } while (cursor);
    if (await this.getState('bulk')) {
      this.onProgress({ scope: key, phase: 'snapshot', rows: st.rows, seq: firstHead ?? 0, pending: 0 });
      await this.finishBulk();
    }
    // Changes that landed while we paged are picked up by pull() from the
    // *first* page's head, so nothing between pages is missed.
    const cur = await this.seq();
    if (!cur || (firstHead !== undefined && firstHead < cur)) await this.setState('seq', String(firstHead ?? 0));
  }

  private async applySnapshot(page: SnapshotPage): Promise<void> {
    await this.ex.transaction(async (tx) => {
      // Rows arrive in API order, not dependency order; check FKs at commit.
      await tx.exec(`PRAGMA defer_foreign_keys = ON`);
      if (page.ref) {
        for (const b of page.ref.brands) await tx.run(`INSERT INTO brands(id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name`, [b.id, b.name]);
        const cats = [...page.ref.categories].sort((a, b) => (a.parentId === null ? 0 : 1) - (b.parentId === null ? 0 : 1));
        for (const c of cats)
          await tx.run(`INSERT INTO categories(id, name, parent_id) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id`, [c.id, c.name, c.parentId]);
        for (const v of page.ref.vehicles)
          await tx.run(
            `INSERT INTO vehicles(id, make, model, year_from, year_to, engine, body, drive_side) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET make = excluded.make, model = excluded.model, year_from = excluded.year_from,
               year_to = excluded.year_to, engine = excluded.engine, body = excluded.body, drive_side = excluded.drive_side`,
            [v.id, v.make, v.model, v.yearFrom, v.yearTo, v.engine, v.body, v.driveSide],
          );
      }
      // One statement per page: rows travel as a JSON array and are unpacked by
      // json_each inside SQLite. ~50× faster than row-at-a-time on sqlite-wasm,
      // and portable to D1/libSQL (no bind-parameter limits).
      if (page.parts.length) await tx.run(BULK_UPSERT_PARTS, [JSON.stringify(page.parts)]);
      if (page.fitments.length) await tx.run(BULK_INSERT_FITMENTS, [JSON.stringify(page.fitments)]);
    });
  }

  private async upsert(tx: SqlExecutor, p: Part): Promise<void> {
    await tx.run(UPSERT_PART, [
      p.id, p.sku, p.mpn, p.gtin, p.brandId, p.categoryId, p.name, p.priceCents, p.currency,
      p.stock, p.status, p.evidence, p.rights, p.holdReason, p.updatedAt, p.hlc,
    ]);
  }

  /**
   * Apply remote changes. Only parts already in a replicated scope are
   * updated (a scoped replica must not grow into a full copy by accident),
   * except when an "all" scope is held.
   */
  async pull(limit = 2000): Promise<number> {
    let applied = 0;
    const full = (await this.scopes()).some((s) => s.key === 'all');
    for (;;) {
      const since = await this.seq();
      const { changes, head } = await this.transport.changes(since, limit);
      if (!changes.length) {
        if (head > since) await this.setState('seq', String(head));
        break;
      }
      await this.ex.transaction(async (tx) => {
        for (const c of changes) applied += await this.applyChange(tx, c, full);
        await tx.run(`INSERT INTO sync_state(key, value) VALUES ('seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [
          String(changes[changes.length - 1]!.seq),
        ]);
      });
      this.onProgress({ scope: '*', phase: 'changes', rows: applied, seq: changes[changes.length - 1]!.seq, pending: await this.pendingCount() });
      if (changes.length < limit) break;
    }
    return applied;
  }

  private async applyChange(tx: SqlExecutor, c: Change, full: boolean): Promise<number> {
    this.hlc.receive(c.hlc);
    if (c.op === 'delete' || !c.row) {
      const r = await tx.run(`DELETE FROM parts WHERE id = ? AND hlc < ?`, [c.entityId, c.hlc]);
      return r.changes;
    }
    if (!full) {
      const have = await one(tx, `SELECT 1 AS x FROM parts WHERE id = ?`, [c.entityId]);
      if (!have) return 0;
    }
    // A pending local edit with a newer clock wins; keep it until pushed.
    const mine = await one(tx, `SELECT 1 AS x FROM outbox WHERE entity_id = ? AND hlc > ?`, [c.entityId, c.row.hlc]);
    if (mine) return 0;
    await this.upsert(tx, c.row);
    return 1;
  }

  /** Local-first edit: visible immediately, synced later. */
  async mutate(partId: string, patch: PartPatch): Promise<Mutation> {
    const m: Mutation = { id: ulid(), entity: 'part', entityId: partId, patch, hlc: this.hlc.tick(), origin: this.hlc.node };
    const { sql, params } = patchSql(patch);
    if (!sql) throw new Error('Empty patch');
    await this.ex.transaction(async (tx) => {
      await tx.run(`UPDATE parts SET ${sql}, hlc = ?, updated_at = ? WHERE id = ?`, [...params, m.hlc, Date.now(), partId]);
      await tx.run(`INSERT INTO outbox(id, entity_id, patch, hlc, created_at) VALUES (?, ?, ?, ?, ?)`, [
        m.id,
        partId,
        JSON.stringify(patch),
        m.hlc,
        Date.now(),
      ]);
    });
    return m;
  }

  async push(): Promise<{ accepted: number; rejected: number }> {
    const rows = await this.ex.all<{ id: string; entity_id: string; patch: string; hlc: string }>(
      `SELECT id, entity_id, patch, hlc FROM outbox ORDER BY hlc LIMIT 500`,
    );
    if (!rows.length) return { accepted: 0, rejected: 0 };
    const res = await this.transport.push(
      rows.map((r) => ({ id: r.id, entity: 'part', entityId: r.entity_id, patch: JSON.parse(r.patch) as PartPatch, hlc: r.hlc, origin: this.hlc.node })),
    );
    // Accepted → done. Rejected as stale → the server holds a newer write;
    // drop ours and let pull() bring the winner down.
    const done = [...res.accepted, ...res.rejected.map((r) => r.id)];
    await this.ex.transaction(async (tx) => {
      for (const id of done) await tx.run(`DELETE FROM outbox WHERE id = ?`, [id]);
    });
    return { accepted: res.accepted.length, rejected: res.rejected.length };
  }

  /** One full round: push local edits, then pull remote ones. */
  async sync(): Promise<{ pushed: number; pulled: number }> {
    const { accepted } = await this.push();
    const pulled = await this.pull();
    return { pushed: accepted, pulled };
  }
}
