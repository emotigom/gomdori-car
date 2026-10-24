import type { SqlExecutor, SqlValue } from './executor.ts';

/** Minimal structural type for a Cloudflare D1 binding (avoids a hard dep on workers-types). */
export interface D1Like {
  prepare(sql: string): {
    bind(...v: unknown[]): { all<T>(): Promise<{ results: T[] }>; run(): Promise<{ meta: { changes: number } }> };
  };
  exec(sql: string): Promise<unknown>;
}

/**
 * Cloudflare D1 adapter (edge). D1 has no interactive transactions, so
 * `transaction` runs inline; repository writes are idempotent per mutation id.
 * D1 limits: 10 GB per database — 1M parts + ~3M fitments is ~1–2 GB.
 */
export class D1Executor implements SqlExecutor {
  readonly dialect = 'sqlite' as const;
  readonly label = 'cloudflare:d1';
  private db: D1Like;
  constructor(db: D1Like) {
    this.db = db;
  }
  async all<T>(sql: string, params: SqlValue[] = []) {
    return (await this.db.prepare(sql).bind(...params).all<T>()).results;
  }
  async run(sql: string, params: SqlValue[] = []) {
    const r = await this.db.prepare(sql).bind(...params).run();
    return { changes: r.meta.changes };
  }
  async exec(sql: string) {
    await this.db.exec(sql);
  }
  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
