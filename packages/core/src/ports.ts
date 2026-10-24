import type { Page, PartQuery } from './query.ts';
import type { Brand, Category, FitmentRow, Part, PartRow, Vehicle } from './types.ts';

/**
 * Ports (hexagonal architecture). Each deployment target plugs in adapters:
 *
 *   target           SqlExecutor adapter            where it runs
 *   ---------------  -----------------------------  ---------------------------
 *   server / local   node:sqlite                    Node 22+ (any cloud VM)
 *   edge             Cloudflare D1                  Workers
 *   edge (any cloud) libSQL / Turso                 Workers, Deno, Bun, Vercel
 *   on-device        sqlite-wasm + OPFS             browser Web Worker
 *
 * All of them speak SQLite SQL, so one repository implementation
 * (`SqlPartsRepository` in @gomdori/sql) serves every target.
 */

export interface CatalogueStats {
  total: number;
  byStatus: Record<string, number>;
  byEvidence: Record<string, number>;
  byRights: Record<string, number>;
  byCategory: { id: number; name: string; count: number }[];
  byBrand: { id: number; name: string; count: number }[];
  /** Active + evidence A + rights own/licensed: parts that pass Gate 0 for content use. */
  contentReady: number;
  fitments: number;
  vehicles: number;
  /** When the stats snapshot was computed (epoch ms). */
  computedAt: number;
}

export interface PartsReader {
  list(q: PartQuery): Promise<Page<PartRow>>;
  get(id: string): Promise<PartRow | null>;
  fitments(partId: string): Promise<FitmentRow[]>;
  stats(): Promise<CatalogueStats>;
  brands(): Promise<Brand[]>;
  categories(): Promise<Category[]>;
  /** Parts per category matching a query — drives the per-system counts on the 3D vehicle. */
  coverage(q: PartQuery): Promise<{ categoryId: number; count: number }[]>;
  /** Vehicle lookup for the fitment picker (make → model → year). */
  vehicles(filter: { make?: string; model?: string; limit?: number }): Promise<Vehicle[]>;
}

/** A field-level patch. Only these fields are editable from the dashboard. */
export type PartPatch = Partial<Pick<Part, 'status' | 'holdReason' | 'evidence' | 'rights' | 'priceCents' | 'stock' | 'name'>>;

export interface Mutation {
  /** Client-generated id; makes push idempotent. */
  id: string;
  entity: 'part';
  entityId: string;
  patch: PartPatch;
  hlc: string;
  origin: string;
}

export interface Change {
  seq: number;
  entity: 'part';
  entityId: string;
  op: 'upsert' | 'delete';
  /** Full row after the change (so a client can apply it without a join). */
  row: Part | null;
  hlc: string;
}

export interface PartsWriter {
  /** Apply mutations with last-writer-wins on HLC. Returns the ones accepted. */
  apply(mutations: Mutation[]): Promise<{ accepted: string[]; rejected: { id: string; reason: string }[] }>;
}

export interface ChangeFeed {
  /** Changes with seq > since, oldest first. */
  changesSince(since: number, limit: number): Promise<{ changes: Change[]; head: number }>;
}
