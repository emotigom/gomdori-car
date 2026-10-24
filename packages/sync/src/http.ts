import { toSearchParams, type Mutation } from '@gomdori/core';
import type { ChangesPage, SnapshotPage, SyncScope, SyncTransport } from './protocol.ts';

/** fetch()-based transport — works in browsers, workers, Node, Deno, Bun, edge runtimes. */
export class HttpSyncTransport implements SyncTransport {
  readonly base: string;
  private f: typeof fetch;
  constructor(base: string, f: typeof fetch = (...a) => fetch(...a)) {
    this.base = base.replace(/\/$/, '');
    this.f = f;
  }
  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await this.f(this.base + path, init);
    if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${r.status}`);
    return (await r.json()) as T;
  }
  snapshot(scope: SyncScope, cursor: string | null, limit: number) {
    const sp = toSearchParams({ ...scope, limit, cursor });
    return this.json<SnapshotPage>(`/sync/snapshot?${sp}`);
  }
  changes(since: number, limit: number) {
    return this.json<ChangesPage>(`/sync/changes?since=${since}&limit=${limit}`);
  }
  push(mutations: Mutation[]) {
    return this.json<{ accepted: string[]; rejected: { id: string; reason: string }[] }>(`/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mutations }),
    });
  }
}
