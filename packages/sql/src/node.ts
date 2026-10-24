import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlExecutor, SqlValue } from './executor.ts';

/**
 * node:sqlite adapter (Node 22.13+, no native build step).
 * Used by: local dev server, any-cloud VM/container deployments, seed + bench tools.
 */
export class NodeSqliteExecutor implements SqlExecutor {
  readonly dialect = 'sqlite' as const;
  readonly label: string;
  readonly db: DatabaseSync;
  private depth = 0;
  private stmts = new Map<string, ReturnType<DatabaseSync['prepare']>>();

  constructor(path: string, opts: { readOnly?: boolean } = {}) {
    this.db = new DatabaseSync(path, { readOnly: opts.readOnly ?? false });
    this.label = `node:sqlite ${path}`;
    if (!opts.readOnly) this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`);
    this.db.exec(`PRAGMA cache_size = -131072; PRAGMA temp_store = MEMORY; PRAGMA mmap_size = 1073741824;`);
  }

  private stmt(sql: string) {
    let s = this.stmts.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      if (this.stmts.size > 500) this.stmts.clear();
      this.stmts.set(sql, s);
    }
    return s;
  }

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.stmt(sql).all(...(params as SQLInputValue[])) as T[];
  }
  async run(sql: string, params: SqlValue[] = []) {
    const r = this.stmt(sql).run(...(params as SQLInputValue[]));
    return { changes: Number(r.changes) };
  }
  async exec(sql: string) {
    this.db.exec(sql);
  }
  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const sp = `sp${this.depth++}`;
    this.db.exec(`SAVEPOINT ${sp}`);
    try {
      const r = await fn(this);
      this.db.exec(`RELEASE ${sp}`);
      return r;
    } catch (e) {
      this.db.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw e;
    } finally {
      this.depth--;
    }
  }
  close() {
    this.db.close();
  }
}
