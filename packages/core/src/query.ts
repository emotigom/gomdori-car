import type { EvidenceGrade, PartStatus, RightsStatus } from './types.ts';

/**
 * The one query contract every storage adapter implements — edge API,
 * server, and on-device SQLite all accept exactly this object, so the UI never
 * knows (or cares) where the rows came from.
 *
 * Pagination is keyset-only (cursor), never OFFSET: OFFSET cost grows with
 * page depth, which breaks at 1M+ rows.
 */
export interface PartQuery {
  /** Full-text search over name / MPN / SKU / GTIN / brand (prefix match). */
  q?: string;
  brandId?: number[];
  categoryId?: number[];
  status?: PartStatus[];
  evidence?: EvidenceGrade[];
  rights?: RightsStatus[];
  /** Fitment filter: only parts that fit this vehicle. */
  vehicleId?: number;
  make?: string;
  model?: string;
  year?: number;
  inStock?: boolean;
  sort?: PartSort;
  limit?: number;
  cursor?: string | null;
}

export type PartSort = 'id' | 'updated_desc' | 'price_asc' | 'price_desc';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  /** Wall time spent in the storage layer, for the latency badge in the UI. */
  tookMs: number;
}

export const MAX_LIMIT = 500;
export const DEFAULT_LIMIT = 100;

const STATUS: readonly PartStatus[] = ['active', 'hold', 'draft', 'discontinued'];
const EVIDENCE: readonly EvidenceGrade[] = ['A', 'B', 'U', 'H'];
const RIGHTS: readonly RightsStatus[] = ['own', 'licensed', 'unknown'];
const SORTS: readonly PartSort[] = ['id', 'updated_desc', 'price_asc', 'price_desc'];

function ints(v: string | null): number[] | undefined {
  if (!v) return undefined;
  const out = v.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return out.length ? out.slice(0, 100) : undefined;
}

function oneOf<T extends string>(v: string | null, allowed: readonly T[]): T[] | undefined {
  if (!v) return undefined;
  const out = v.split(',').filter((x): x is T => (allowed as readonly string[]).includes(x));
  return out.length ? out : undefined;
}

/** Parse + validate a query from URL search params (untrusted input). */
export function parsePartQuery(sp: URLSearchParams): PartQuery {
  const q: PartQuery = {};
  const text = sp.get('q')?.trim();
  if (text) q.q = text.slice(0, 120);
  q.brandId = ints(sp.get('brand'));
  q.categoryId = ints(sp.get('category'));
  q.status = oneOf(sp.get('status'), STATUS);
  q.evidence = oneOf(sp.get('evidence'), EVIDENCE);
  q.rights = oneOf(sp.get('rights'), RIGHTS);
  const vid = Number(sp.get('vehicle'));
  if (Number.isInteger(vid) && vid > 0) q.vehicleId = vid;
  const make = sp.get('make')?.trim();
  if (make) q.make = make.slice(0, 60);
  const model = sp.get('model')?.trim();
  if (model) q.model = model.slice(0, 60);
  const year = Number(sp.get('year'));
  if (Number.isInteger(year) && year > 1900 && year < 2100) q.year = year;
  if (sp.get('inStock') === '1') q.inStock = true;
  const sort = sp.get('sort') as PartSort | null;
  if (sort && SORTS.includes(sort)) q.sort = sort;
  const limit = Number(sp.get('limit'));
  q.limit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT;
  q.cursor = sp.get('cursor');
  for (const k of Object.keys(q) as (keyof PartQuery)[]) if (q[k] === undefined) delete q[k];
  return q;
}

/** Serialise a query back to URL params (inverse of parsePartQuery). */
export function toSearchParams(q: PartQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.q) sp.set('q', q.q);
  if (q.brandId?.length) sp.set('brand', q.brandId.join(','));
  if (q.categoryId?.length) sp.set('category', q.categoryId.join(','));
  if (q.status?.length) sp.set('status', q.status.join(','));
  if (q.evidence?.length) sp.set('evidence', q.evidence.join(','));
  if (q.rights?.length) sp.set('rights', q.rights.join(','));
  if (q.vehicleId) sp.set('vehicle', String(q.vehicleId));
  if (q.make) sp.set('make', q.make);
  if (q.model) sp.set('model', q.model);
  if (q.year) sp.set('year', String(q.year));
  if (q.inStock) sp.set('inStock', '1');
  if (q.sort) sp.set('sort', q.sort);
  if (q.limit) sp.set('limit', String(q.limit));
  if (q.cursor) sp.set('cursor', q.cursor);
  return sp;
}

/** Opaque keyset cursor: the sort key of the last row, base64url JSON. */
export function encodeCursor(key: (string | number)[]): string {
  const json = JSON.stringify(key);
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCursor(c: string | null | undefined): (string | number)[] | null {
  if (!c) return null;
  try {
    const b64 = c.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString();
    const v = JSON.parse(json);
    return Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number') ? v : null;
  } catch {
    return null;
  }
}
