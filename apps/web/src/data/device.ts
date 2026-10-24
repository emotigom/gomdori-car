import type { PartPatch, PartQuery } from '@gomdori/core';
import type { SyncProgress, SyncScope } from '@gomdori/sync';
import type { LoadProgress } from '@gomdori/demo';
import type { DataSource } from './source.ts';

export interface DeviceStatus {
  label: string;
  persistent: boolean;
  node: string;
  seq: number;
  pending: number;
  parts: number;
  scopes: { key: string; done: boolean; rows: number }[];
}

/** Main-thread proxy to the device worker (promise-based RPC). */
export class DeviceSource implements DataSource {
  readonly kind = 'device' as const;
  private w: Worker;
  private seq = 0;
  private waiting = new Map<number, { ok: (v: unknown) => void; err: (e: Error) => void }>();
  readonly ready: Promise<void>;
  onProgress: (p: SyncProgress) => void = () => {};
  onDemo: (p: LoadProgress) => void = () => {};

  constructor(origin = location.origin) {
    this.w = new Worker(new URL('./device.worker.ts', import.meta.url), { type: 'module' });
    this.ready = new Promise((resolve, reject) => {
      this.w.addEventListener('message', (e: MessageEvent) => {
        const m = e.data;
        if (m.type === 'ready') resolve();
        else if (m.type === 'fatal') reject(new Error(m.error));
        else if (m.type === 'progress') this.onProgress(m.progress);
        else if (m.type === 'demo') this.onDemo(m.progress);
        else if (typeof m.id === 'number') {
          const p = this.waiting.get(m.id);
          this.waiting.delete(m.id);
          if (m.ok) p?.ok(m.result);
          else p?.err(new Error(m.error));
        }
      });
    });
    this.w.postMessage({ type: 'init', origin });
  }

  private call<T>(op: string, ...args: unknown[]): Promise<T> {
    return this.ready.then(
      () =>
        new Promise<T>((ok, err) => {
          const id = ++this.seq;
          this.waiting.set(id, { ok: ok as (v: unknown) => void, err });
          this.w.postMessage({ id, op, args });
        }),
    );
  }

  list(q: PartQuery) {
    return this.call<Awaited<ReturnType<DataSource['list']>>>('list', q);
  }
  count(q: PartQuery) {
    return this.call<{ count: number; capped: boolean }>('count', q);
  }
  get(id: string) {
    return this.call<Awaited<ReturnType<DataSource['get']>>>('get', id);
  }
  fitments(id: string) {
    return this.call<Awaited<ReturnType<DataSource['fitments']>>>('fitments', id);
  }
  stats() {
    return this.call<Awaited<ReturnType<DataSource['stats']>>>('stats');
  }
  brands() {
    return this.call<Awaited<ReturnType<DataSource['brands']>>>('brands');
  }
  categories() {
    return this.call<Awaited<ReturnType<DataSource['categories']>>>('categories');
  }
  coverage(q: PartQuery) {
    return this.call<{ categoryId: number; count: number }[]>('coverage', q);
  }
  vehicles(make: string, model?: string) {
    return this.call<Awaited<ReturnType<DataSource['vehicles']>>>('vehicles', make, model);
  }
  makes() {
    return this.call<string[]>('makes');
  }
  models(make: string) {
    return this.call<string[]>('models', make);
  }
  update(id: string, patch: PartPatch) {
    return this.call<Awaited<ReturnType<DataSource['update']>>>('update', id, patch);
  }
  replicate(scope: SyncScope) {
    return this.call<void>('replicate', scope);
  }
  sync() {
    return this.call<{ pushed: number; pulled: number }>('sync');
  }
  status() {
    return this.call<DeviceStatus>('status');
  }
  /** Generate the on-device demo catalogue if the local store is empty. */
  demo(n: number) {
    return this.call<{ generated: boolean; parts: number }>('demo', n);
  }
  reset() {
    return this.call<void>('reset');
  }
}
