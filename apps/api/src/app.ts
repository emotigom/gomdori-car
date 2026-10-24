import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import {
  Hlc,
  INSIGHTS_AS_OF,
  accountBenchmarks,
  channelPlan,
  competitorPatterns,
  formatBenchmarks,
  gates,
  parsePartQuery,
  ulid,
  type Mutation,
  type PartPatch,
} from '@gomdori/core';
import type { SqlPartsRepository } from '@gomdori/sql';
import { snapshotPage } from '@gomdori/sync';

/**
 * Runtime-agnostic HTTP API. The same `createApp()` is mounted by:
 *   src/node.ts    – Node (any cloud VM / container / on-prem)
 *   src/worker.ts  – Cloudflare Workers (D1 or libSQL)
 *   Deno / Bun / Vercel Edge – `export default { fetch: app.fetch }`
 *
 * Cache headers are written for a CDN in front: reference data is long-lived
 * at the edge, part lists are short-lived, writes are never cached.
 */
export interface AppOptions {
  repo: SqlPartsRepository;
  nodeId: string;
  /** Allowed browser origins (dev: Vite). */
  corsOrigins?: string[];
}

const EDITABLE: (keyof PartPatch)[] = ['status', 'holdReason', 'evidence', 'rights', 'priceCents', 'stock', 'name'];

function cache(c: Context, edgeSeconds: number, browserSeconds = 0) {
  c.header('Cache-Control', `public, max-age=${browserSeconds}, s-maxage=${edgeSeconds}, stale-while-revalidate=${edgeSeconds * 4}`);
}

function sanitizePatch(raw: unknown): PartPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in (raw as object)) out[k] = (raw as Record<string, unknown>)[k];
  return Object.keys(out).length ? (out as PartPatch) : null;
}

export function createApp({ repo, nodeId, corsOrigins = ['*'] }: AppOptions) {
  const app = new Hono();
  const hlc = new Hlc(nodeId);

  app.use('*', cors({ origin: corsOrigins, allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'] }));
  app.use('*', async (c, next) => {
    const t0 = performance.now();
    await next();
    c.header('Server-Timing', `app;dur=${(performance.now() - t0).toFixed(1)}`);
    c.header('X-Served-By', nodeId);
  });

  app.get('/health', async (c) => c.json({ ok: true, node: nodeId, store: repo.ex.label }));

  // ---------------------------------------------------------------- reads
  app.get('/api/stats', async (c) => {
    cache(c, 60);
    return c.json(await repo.stats());
  });

  app.get('/api/parts', async (c) => {
    const q = parsePartQuery(new URL(c.req.url).searchParams);
    cache(c, 30);
    return c.json(await repo.list(q));
  });

  app.get('/api/parts/count', async (c) => {
    const q = parsePartQuery(new URL(c.req.url).searchParams);
    cache(c, 60);
    return c.json(await repo.count(q));
  });

  app.get('/api/coverage', async (c) => {
    const q = parsePartQuery(new URL(c.req.url).searchParams);
    cache(c, 300, 60);
    return c.json(await repo.coverage(q));
  });

  app.get('/api/vehicles', async (c) => {
    cache(c, 3600, 300);
    return c.json(await repo.vehicles({ make: c.req.query('make'), model: c.req.query('model'), limit: 500 }));
  });

  app.get('/api/parts/:id', async (c) => {
    const p = await repo.get(c.req.param('id'));
    return p ? c.json(p) : c.json({ error: 'not_found' }, 404);
  });

  app.get('/api/parts/:id/fitments', async (c) => {
    cache(c, 300);
    return c.json(await repo.fitments(c.req.param('id')));
  });

  app.get('/api/brands', async (c) => {
    cache(c, 3600, 300);
    return c.json(await repo.brands());
  });
  app.get('/api/categories', async (c) => {
    cache(c, 3600, 300);
    return c.json(await repo.categories());
  });
  app.get('/api/vehicles/makes', async (c) => {
    cache(c, 3600, 300);
    return c.json(await repo.makes());
  });
  app.get('/api/vehicles/models', async (c) => {
    cache(c, 3600, 300);
    return c.json(await repo.models(c.req.query('make') ?? ''));
  });

  app.get('/api/insights', (c) => {
    cache(c, 86400, 3600);
    return c.json({ asOf: INSIGHTS_AS_OF, formatBenchmarks, accountBenchmarks, competitorPatterns, channelPlan, gates });
  });

  // ---------------------------------------------------------------- writes
  /** Online edit from the dashboard (the offline path goes through /sync/push). */
  app.patch('/api/parts/:id', async (c) => {
    const patch = sanitizePatch(await c.req.json().catch(() => null));
    if (!patch) return c.json({ error: 'invalid_patch', editable: EDITABLE }, 400);
    const m: Mutation = { id: ulid(), entity: 'part', entityId: c.req.param('id'), patch, hlc: hlc.tick(), origin: nodeId };
    const r = await repo.apply([m]);
    if (r.rejected.length) return c.json({ error: r.rejected[0]!.reason }, r.rejected[0]!.reason === 'not_found' ? 404 : 409);
    return c.json(await repo.get(m.entityId));
  });

  // ---------------------------------------------------------------- sync
  app.get('/sync/snapshot', async (c) => {
    const q = parsePartQuery(new URL(c.req.url).searchParams);
    const scope = { categoryId: q.categoryId, brandId: q.brandId, make: q.make, status: q.status };
    // Snapshot pages may be larger than list pages (bulk transfer, not UI).
    const limit = Math.min(5000, Math.max(100, Number(c.req.query('limit') ?? 2000) || 2000));
    return c.json(await snapshotPage(repo, scope, q.cursor ?? null, limit));
  });

  app.get('/sync/changes', async (c) => {
    const since = Math.max(0, Number(c.req.query('since') ?? 0) || 0);
    const limit = Math.min(5000, Math.max(1, Number(c.req.query('limit') ?? 2000) || 2000));
    return c.json(await repo.changesSince(since, limit));
  });

  app.post('/sync/push', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { mutations?: unknown[] } | null;
    if (!body || !Array.isArray(body.mutations) || body.mutations.length > 500) return c.json({ error: 'invalid_body' }, 400);
    const ms: Mutation[] = [];
    for (const raw of body.mutations) {
      const m = raw as Partial<Mutation>;
      const patch = sanitizePatch(m.patch);
      if (typeof m.id !== 'string' || typeof m.entityId !== 'string' || typeof m.hlc !== 'string' || !patch) continue;
      hlc.receive(m.hlc);
      ms.push({ id: m.id, entity: 'part', entityId: m.entityId, patch, hlc: m.hlc, origin: String(m.origin ?? 'unknown') });
    }
    return c.json(await repo.apply(ms));
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'internal', message: err.message }, 500);
  });

  return app;
}
