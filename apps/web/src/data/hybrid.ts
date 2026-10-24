import type { PartPatch, PartQuery } from '@gomdori/core';
import type { DeviceSource, DeviceStatus } from './device.ts';
import type { EdgeSource } from './edge.ts';
import type { DataSource } from './source.ts';

export type Mode = 'auto' | 'edge' | 'device';

/**
 * Query router — the heart of "local-first with a 1M-row cloud behind it".
 *
 *  auto:   query the device replica when its replicated scopes fully cover the
 *          query (zero network, works offline); otherwise the edge API.
 *          If the edge is unreachable, fall back to the device and mark the
 *          answer as possibly partial.
 *  edge:   always the network (global, complete).
 *  device: always local (offline drill, or field use).
 */
export class HybridSource {
  mode: Mode = 'auto';
  /** false when no API answered /health — the app then runs entirely on-device (demo). */
  edgeOnline = true;
  status: DeviceStatus | null = null;
  readonly edge: EdgeSource;
  readonly device: DeviceSource;
  constructor(edge: EdgeSource, device: DeviceSource) {
    this.edge = edge;
    this.device = device;
  }

  /** Is there an API behind this origin (or VITE_API_BASE)? A static host answers 404 or HTML. */
  async probeEdge(timeoutMs = 3500): Promise<boolean> {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const r = await fetch(`${this.edge.base}/health`, { signal: ctl.signal });
      clearTimeout(t);
      const ok = r.ok && (r.headers.get('content-type') ?? '').includes('json') && (await r.json()).ok === true;
      this.edgeOnline = ok;
    } catch {
      this.edgeOnline = false;
    }
    if (!this.edgeOnline) this.mode = 'device';
    return this.edgeOnline;
  }

  async refreshStatus(): Promise<DeviceStatus | null> {
    try {
      this.status = await this.device.status();
    } catch {
      this.status = null;
    }
    return this.status;
  }

  /** Does a completed local scope contain every row this query can return? */
  covers(q: PartQuery): boolean {
    const scopes = this.status?.scopes.filter((s) => s.done) ?? [];
    return scopes.some((s) => {
      if (s.key === 'all') return true;
      const parts = new URLSearchParams(s.key);
      for (const [k, v] of parts) {
        const allowed = v.split('.');
        const want =
          k === 'category' ? q.categoryId?.map(String) : k === 'brand' ? q.brandId?.map(String) : k === 'status' ? q.status : k === 'make' ? (q.make ? [q.make] : undefined) : undefined;
        if (!want?.length || !want.every((x) => allowed.includes(x))) return false;
      }
      return true;
    });
  }

  pick(q: PartQuery | null): DataSource {
    if (this.mode === 'edge') return this.edge;
    if (this.mode === 'device') return this.device;
    if (q && this.covers(q)) return this.device;
    return this.edge;
  }

  /** Run on the picked source; on network failure fall back to the device. */
  async run<T>(q: PartQuery | null, fn: (s: DataSource) => Promise<T>): Promise<{ value: T; by: 'edge' | 'device'; partial: boolean }> {
    const s = this.pick(q);
    try {
      return { value: await fn(s), by: s.kind, partial: false };
    } catch (e) {
      if (s.kind === 'edge' && this.mode === 'auto' && this.status?.parts) {
        return { value: await fn(this.device), by: 'device', partial: !(q && this.covers(q)) };
      }
      throw e;
    }
  }

  /** Local-first edit when the row lives on the device; otherwise online edit. */
  async update(id: string, patch: PartPatch, q: PartQuery | null) {
    const local = this.mode === 'device' || (this.mode === 'auto' && q !== null && this.covers(q));
    if (local) {
      const row = await this.device.update(id, patch);
      void this.device.sync().catch(() => {}); // best-effort; outbox keeps it if offline
      return { row, by: 'device' as const };
    }
    return { row: await this.edge.update(id, patch), by: 'edge' as const };
  }
}
