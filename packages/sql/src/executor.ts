/**
 * The narrowest possible database port. Every SQLite-family engine we target
 * (node:sqlite, Cloudflare D1, libSQL/Turso, sqlite-wasm in a browser worker)
 * can implement these four methods, which is what makes the repository code
 * cloud-, edge- and device-portable.
 */
export type SqlValue = string | number | null;

export interface SqlExecutor {
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  /** Multi-statement DDL / scripts, no params. */
  exec(sql: string): Promise<void>;
  /**
   * Run `fn` atomically where the engine supports it. Engines without
   * interactive transactions (D1) run `fn` directly; callers keep each
   * mutation individually idempotent so a partial batch is safe to retry.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  readonly dialect: 'sqlite';
  readonly label: string;
}

export async function one<T>(ex: SqlExecutor, sql: string, params?: SqlValue[]): Promise<T | null> {
  const rows = await ex.all<T>(sql, params);
  return rows[0] ?? null;
}
