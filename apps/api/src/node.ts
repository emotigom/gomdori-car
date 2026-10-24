/**
 * Node entrypoint — runs on any cloud (VM, container, Fly, Render, ECS, Cloud Run) or on-prem.
 *   npm run dev:api                    (DB_PATH, PORT optional)
 */
import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { SqlPartsRepository, migrate } from '@gomdori/sql';
import { NodeSqliteExecutor } from '@gomdori/sql/node';
import { loadDemoCatalogue } from '@gomdori/demo';
import { createApp } from './app.ts';

// fileURLToPath, not URL.pathname: the latter yields '/C:/…' on Windows
const dbPath = process.env.DB_PATH ?? fileURLToPath(new URL('../../../data/parts.db', import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const fresh = !existsSync(dbPath);

const ex = new NodeSqliteExecutor(dbPath);
await migrate(ex);
if (fresh) {
  // First run without `npm run seed`: start with a small synthetic catalogue so the dashboard has data.
  const n = Number(process.env.DEMO_PARTS ?? 50_000);
  console.log(`[api] ${dbPath} not found — generating ${n.toLocaleString()} demo parts (npm run seed for 1,000,000)…`);
  await loadDemoCatalogue(ex, n);
}
const repo = new SqlPartsRepository(ex);
const app = createApp({ repo, nodeId: process.env.NODE_ID ?? `node-${hostname()}` });

serve({ fetch: app.fetch, port }, (i) => console.log(`[api] ${ex.label} → http://localhost:${i.port}`));
