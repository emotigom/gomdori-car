/// <reference lib="webworker" />
/**
 * On-device catalogue: SQLite (WASM) persisted in OPFS, running off the main
 * thread. It holds the *same schema* as the cloud, so the same
 * SqlPartsRepository answers the same PartQuery here as on the server.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SqlPartsRepository, type SqlExecutor, type SqlValue } from '@gomdori/sql';
import { HttpSyncTransport, SyncClient, type SyncScope } from '@gomdori/sync';
import { ulid } from '@gomdori/core';
import { loadDemoCatalogue } from '@gomdori/demo';

type Db = {
  exec(o: { sql: string; bind?: SqlValue[]; rowMode?: 'object'; returnValue?: 'resultRows' }): unknown;
  changes(): number;
};

class WasmExecutor implements SqlExecutor {
  readonly dialect = 'sqlite' as const;
  readonly label: string;
  private db: Db;
  private depth = 0;
  constructor(db: Db, label: string) {
    this.db = db;
    this.label = label;
  }
  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.db.exec({ sql, bind: params.length ? params : undefined, rowMode: 'object', returnValue: 'resultRows' }) as T[];
  }
  async run(sql: string, params: SqlValue[] = []) {
    this.db.exec({ sql, bind: params.length ? params : undefined });
    return { changes: this.db.changes() };
  }
  async exec(sql: string) {
    this.db.exec({ sql });
  }
  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const sp = `sp${this.depth++}`;
    this.db.exec({ sql: `SAVEPOINT ${sp}` });
    try {
      const r = await fn(this);
      this.db.exec({ sql: `RELEASE ${sp}` });
      return r;
    } catch (e) {
      this.db.exec({ sql: `ROLLBACK TO ${sp}; RELEASE ${sp}` });
      throw e;
    } finally {
      this.depth--;
    }
  }
}

let repo: SqlPartsRepository;
let sync: SyncClient;
let persistent = false;
let ready: Promise<void> | null = null;

function nodeId(): string {
  // Stable per browser profile; stored in the local DB so it survives reloads.
  return `dev-${ulid().slice(-8).toLowerCase()}`;
}

async function boot(origin: string) {
  const sqlite3 = await sqlite3InitModule();
  let db: Db;
  let label: string;
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'gomdori-parts' });
    db = new pool.OpfsSAHPoolDb('/catalogue.db') as unknown as Db;
    label = 'sqlite-wasm · OPFS';
    persistent = true;
  } catch {
    db = new sqlite3.oo1.DB(':memory:') as unknown as Db;
    label = 'sqlite-wasm · memory (OPFS unavailable)';
  }
  db.exec({ sql: 'PRAGMA cache_size = -65536; PRAGMA temp_store = MEMORY; PRAGMA locking_mode = EXCLUSIVE; PRAGMA journal_mode = TRUNCATE; PRAGMA synchronous = NORMAL;' });
  const ex = new WasmExecutor(db, label);
  repo = new SqlPartsRepository(ex);
  await ex.exec(`CREATE TABLE IF NOT EXISTS device (key TEXT PRIMARY KEY, value TEXT)`);
  let id = (await ex.all<{ value: string }>(`SELECT value FROM device WHERE key = 'node'`))[0]?.value;
  if (!id) {
    id = nodeId();
    await ex.run(`INSERT INTO device(key, value) VALUES ('node', ?)`, [id]);
  }
  sync = new SyncClient(ex, new HttpSyncTransport(origin), id);
  sync.onProgress = (p) => postMessage({ type: 'progress', progress: p });
  await sync.init();
}

type Req = { id: number; op: string; args: unknown[] };

const ops: Record<string, (...a: never[]) => Promise<unknown>> = {
  list: (q: never) => repo.list(q),
  count: (q: never) => repo.count(q),
  get: (id: never) => repo.get(id),
  fitments: (id: never) => repo.fitments(id),
  stats: () => repo.stats({ maxAgeMs: 10_000 }),
  brands: () => repo.brands(),
  categories: () => repo.categories(),
  makes: () => repo.makes(),
  coverage: (q: never) => repo.coverage(q),
  vehicles: (make: never, model: never) => repo.vehicles({ make, model, limit: 500 }),
  models: (m: never) => repo.models(m),
  update: async (id: never, patch: never) => {
    await sync.mutate(id, patch);
    return repo.get(id);
  },
  replicate: (scope: never) => sync.replicate(scope as SyncScope),
  sync: () => sync.sync(),
  status: async () => ({
    label: repo.ex.label,
    persistent,
    node: sync.hlc.node,
    seq: await sync.seq(),
    pending: await sync.pendingCount(),
    scopes: await sync.scopes(),
    parts: Number((await repo.ex.all<{ n: number }>(`SELECT count(*) AS n FROM parts`))[0]?.n ?? 0),
  }),
  /** No API reachable (static deploy): build a synthetic catalogue on this device, once. */
  demo: async (n: never) => {
    const have = Number((await repo.ex.all<{ n: number }>(`SELECT count(*) AS n FROM parts`))[0]?.n ?? 0);
    if (have > 0) return { generated: false, parts: have };
    await loadDemoCatalogue(repo.ex, Number(n) || 60_000, { onProgress: (p) => postMessage({ type: 'demo', progress: p }) });
    return { generated: true, parts: Number(n) };
  },
  reset: async () => {
    for (const t of ['fitments', 'parts', 'vehicles', 'categories', 'brands', 'changes', 'outbox', 'sync_state', 'stats_cache'])
      await repo.ex.exec(`DELETE FROM ${t}`);
    await repo.ex.exec(`INSERT INTO parts_fts(parts_fts) VALUES ('delete-all')`).catch(() => {});
  },
};

self.onmessage = async (ev: MessageEvent<Req | { type: 'init'; origin: string }>) => {
  const msg = ev.data;
  if ('type' in msg) {
    ready ??= boot(msg.origin);
    try {
      await ready;
      postMessage({ type: 'ready' });
    } catch (e) {
      postMessage({ type: 'fatal', error: String(e) });
    }
    return;
  }
  try {
    await ready;
    const fn = ops[msg.op];
    if (!fn) throw new Error(`unknown op ${msg.op}`);
    const result = await (fn as (...a: unknown[]) => Promise<unknown>)(...msg.args);
    postMessage({ id: msg.id, ok: true, result });
  } catch (e) {
    postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
