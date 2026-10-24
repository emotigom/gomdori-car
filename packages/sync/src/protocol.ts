import type { Brand, Category, Change, Fitment, Mutation, Part, PartQuery, Vehicle } from '@gomdori/core';

/**
 * Wire protocol between any node that holds the catalogue (cloud primary,
 * edge replica) and any node that wants a copy (edge cache, browser, phone).
 *
 *   1. SNAPSHOT  GET  /sync/snapshot?<scope as PartQuery>&cursor=…
 *                → keyset pages of full rows for a *scope* (all parts, one
 *                  category, one brand, one make…). Resumable from any page.
 *   2. CHANGES   GET  /sync/changes?since=<seq>
 *                → compacted change log after the snapshot's head.
 *   3. PUSH      POST /sync/push  { mutations }
 *                → offline edits, LWW on HLC, idempotent by mutation id.
 *
 * Scopes make 1M+ catalogues practical on devices: a workshop tablet only
 * replicates "Toyota" or "Brakes", the search box still falls back to the
 * edge API for anything outside the local scope.
 */
export type SyncScope = Pick<PartQuery, 'categoryId' | 'brandId' | 'make' | 'status'>;

export interface SnapshotPage {
  parts: Part[];
  fitments: Fitment[];
  /** Reference data, sent on the first page only. */
  ref?: { brands: Brand[]; categories: Category[]; vehicles: Vehicle[] };
  nextCursor: string | null;
  /** Change-log head at the time the page was cut; pull from here once done. */
  head: number;
}

export interface ChangesPage {
  changes: Change[];
  head: number;
}

export interface SyncTransport {
  snapshot(scope: SyncScope, cursor: string | null, limit: number): Promise<SnapshotPage>;
  changes(since: number, limit: number): Promise<ChangesPage>;
  push(mutations: Mutation[]): Promise<{ accepted: string[]; rejected: { id: string; reason: string }[] }>;
}

export function scopeKey(s: SyncScope): string {
  const parts: string[] = [];
  if (s.categoryId?.length) parts.push(`category=${s.categoryId.join('.')}`);
  if (s.brandId?.length) parts.push(`brand=${s.brandId.join('.')}`);
  if (s.make) parts.push(`make=${s.make}`);
  if (s.status?.length) parts.push(`status=${s.status.join('.')}`);
  return parts.join('&') || 'all';
}
