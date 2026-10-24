import type { SqlExecutor, SqlValue } from './executor.ts';

/** Structural type for a @libsql/client Client (Turso). Works on Node, Deno, Bun, Workers, Vercel Edge. */
export interface LibsqlLike {
  execute(stmt: { sql: string; args: SqlValue[] }): Promise<{ rows: unknown[]; rowsAffected: number }>;
  executeMultiple(sql: string): Promise<void>;
  transaction(mode: 'write' | 'read'): Promise<{
    execute(stmt: { sql: string; args: SqlValue[] }): Promise<{ rows: unknown[]; rowsAffected: number }>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
  }>;
}

/**
 * libSQL / Turso adapter: the multi-cloud option — a primary in one region
 * with read replicas (and embedded replicas) on any cloud or edge runtime.
 */
export class LibsqlExecutor implements SqlExecutor {
  readonly dialect = 'sqlite' as const;
  readonly label = 'libsql';
  private c: Pick<LibsqlLike, 'execute'> & Partial<LibsqlLike>;
  constructor(c: Pick<LibsqlLike, 'execute'> & Partial<LibsqlLike>) {
    this.c = c;
  }
  async all<T>(sql: string, params: SqlValue[] = []) {
    return (await this.c.execute({ sql, args: params })).rows as T[];
  }
  async run(sql: string, params: SqlValue[] = []) {
    return { changes: (await this.c.execute({ sql, args: params })).rowsAffected };
  }
  async exec(sql: string) {
    if (this.c.executeMultiple) await this.c.executeMultiple(sql);
    else for (const s of sql.split(';').map((x) => x.trim()).filter(Boolean)) await this.c.execute({ sql: s, args: [] });
  }
  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    if (!this.c.transaction) return fn(this);
    const tx = await this.c.transaction('write');
    try {
      const r = await fn(new LibsqlExecutor(tx));
      await tx.commit();
      return r;
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }
}
