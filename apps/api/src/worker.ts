/**
 * Cloudflare Workers entrypoint (edge). Not deployed yet — see wrangler.example.toml.
 *
 * Choose one store per environment:
 *   - D1 binding `DB`              → single-provider edge (Cloudflare only)
 *   - LIBSQL_URL + LIBSQL_TOKEN    → Turso primary with replicas on any cloud;
 *                                    the same Worker code then also runs on Deno Deploy / Vercel Edge.
 */
import { D1Executor, LibsqlExecutor, SqlPartsRepository, type D1Like, type LibsqlLike, type SqlExecutor } from '@gomdori/sql';
import { createApp } from './app.ts';

interface Env {
  DB?: D1Like;
  LIBSQL_URL?: string;
  LIBSQL_TOKEN?: string;
  NODE_ID?: string;
  CORS_ORIGINS?: string;
}

let cached: { fetch: (req: Request) => Response | Promise<Response> } | null = null;

async function store(env: Env): Promise<SqlExecutor> {
  if (env.DB) return new D1Executor(env.DB);
  if (env.LIBSQL_URL) {
    // Loaded lazily so a D1-only bundle never pulls the libSQL client.
    // Add `@libsql/client` as a dependency when using this path.
    const mod = (await import(/* @vite-ignore */ '@libsql/client/web' as string)) as {
      createClient(o: { url: string; authToken?: string }): LibsqlLike;
    };
    return new LibsqlExecutor(mod.createClient({ url: env.LIBSQL_URL, authToken: env.LIBSQL_TOKEN }));
  }
  throw new Error('No store configured: bind D1 as DB or set LIBSQL_URL');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (!cached) {
      const repo = new SqlPartsRepository(await store(env));
      cached = createApp({
        repo,
        nodeId: env.NODE_ID ?? 'edge',
        corsOrigins: env.CORS_ORIGINS?.split(',') ?? ['*'],
      });
    }
    return cached.fetch(req);
  },
};
