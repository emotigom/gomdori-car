import { toSearchParams, type PartPatch, type PartQuery } from '@gomdori/core';
import type { DataSource } from './source.ts';

/** HTTP client for the Hono API (any runtime: Node, Workers, Deno, Bun). */
export class EdgeSource implements DataSource {
  readonly kind = 'edge' as const;
  readonly base: string;
  constructor(base = '') {
    this.base = base;
  }
  private async get_<T>(path: string): Promise<T> {
    const r = await fetch(this.base + path);
    if (!r.ok) throw new Error(`${path} → ${r.status}`);
    return (await r.json()) as T;
  }
  list(q: PartQuery) {
    return this.get_<Awaited<ReturnType<DataSource['list']>>>(`/api/parts?${toSearchParams(q)}`);
  }
  count(q: PartQuery) {
    return this.get_<{ count: number; capped: boolean }>(`/api/parts/count?${toSearchParams(q)}`);
  }
  get(id: string) {
    return this.get_<Awaited<ReturnType<DataSource['get']>>>(`/api/parts/${encodeURIComponent(id)}`);
  }
  fitments(id: string) {
    return this.get_<Awaited<ReturnType<DataSource['fitments']>>>(`/api/parts/${encodeURIComponent(id)}/fitments`);
  }
  stats() {
    return this.get_<Awaited<ReturnType<DataSource['stats']>>>(`/api/stats`);
  }
  brands() {
    return this.get_<Awaited<ReturnType<DataSource['brands']>>>(`/api/brands`);
  }
  categories() {
    return this.get_<Awaited<ReturnType<DataSource['categories']>>>(`/api/categories`);
  }
  coverage(q: PartQuery) {
    return this.get_<{ categoryId: number; count: number }[]>(`/api/coverage?${toSearchParams(q)}`);
  }
  vehicles(make: string, model?: string) {
    return this.get_<Awaited<ReturnType<DataSource['vehicles']>>>(`/api/vehicles?make=${encodeURIComponent(make)}${model ? `&model=${encodeURIComponent(model)}` : ''}`);
  }
  makes() {
    return this.get_<string[]>(`/api/vehicles/makes`);
  }
  models(make: string) {
    return this.get_<string[]>(`/api/vehicles/models?make=${encodeURIComponent(make)}`);
  }
  async update(id: string, patch: PartPatch) {
    const r = await fetch(`${this.base}/api/parts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`update → ${r.status}`);
    return r.json();
  }
}
