import type { Vehicle, Brand, CatalogueStats, Category, FitmentRow, Page, PartPatch, PartQuery, PartRow } from '@gomdori/core';

/**
 * What the UI needs from "the catalogue", wherever it lives. Two
 * implementations: EdgeSource (HTTP → nearest edge/cloud node) and
 * DeviceSource (SQLite in a Web Worker on this device). HybridSource picks
 * per query.
 */
export interface DataSource {
  readonly kind: 'edge' | 'device';
  list(q: PartQuery): Promise<Page<PartRow>>;
  count(q: PartQuery): Promise<{ count: number; capped: boolean }>;
  get(id: string): Promise<PartRow | null>;
  fitments(id: string): Promise<FitmentRow[]>;
  stats(): Promise<CatalogueStats>;
  brands(): Promise<Brand[]>;
  categories(): Promise<Category[]>;
  coverage(q: PartQuery): Promise<{ categoryId: number; count: number }[]>;
  vehicles(make: string, model?: string): Promise<Vehicle[]>;
  makes(): Promise<string[]>;
  models(make: string): Promise<string[]>;
  update(id: string, patch: PartPatch): Promise<PartRow | null>;
}

export type Served = { by: 'edge' | 'device'; tookMs: number };
