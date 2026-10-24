import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hlc, ulid, type Mutation } from '@gomdori/core';
import { SqlPartsRepository, migrate } from '@gomdori/sql';
import { NodeSqliteExecutor } from '@gomdori/sql/node';
import { SyncClient, snapshotPage, type SyncTransport } from '../src/index.ts';

async function server(n = 300) {
  const ex = new NodeSqliteExecutor(':memory:');
  await migrate(ex);
  await ex.exec(`INSERT INTO brands VALUES (1,'Ryco'),(2,'Bosch'); INSERT INTO categories VALUES (1,'Filters',NULL),(2,'Air Filter',1),(3,'Brake Pads',NULL);
    INSERT INTO vehicles VALUES (1,'Toyota','HiLux',2015,2017,'2.8L','Ute','RHD'),(2,'Ford','Ranger',2015,2017,'3.2L','Ute','RHD');`);
  for (let i = 0; i < n; i++) {
    const id = ulid(1_700_000_000_000 + i);
    await ex.run(
      `INSERT INTO parts(id, sku, mpn, gtin, brand_id, category_id, name, price_cents, stock, status, evidence, rights, updated_at, hlc)
       VALUES (?, ?, ?, NULL, ?, ?, ?, 1000, 5, 'active', 'A', 'own', 0, '0000000000000:0000:seed')`,
      [id, `MS-${i}`, `Z${400 + i}`, 1 + (i % 2), i % 3 === 0 ? 3 : 2, `Part ${i}`],
    );
    await ex.run(`INSERT INTO fitments(part_id, vehicle_id, position) VALUES (?, ?, '')`, [id, 1 + (i % 2)]);
  }
  return new SqlPartsRepository(ex);
}

function local(repo: SqlPartsRepository): SyncTransport {
  return {
    snapshot: (s, c, l) => snapshotPage(repo, s, c, l),
    changes: (since, l) => repo.changesSince(since, l),
    push: (ms) => repo.apply(ms),
  };
}

test('replicates a scope in resumable pages', async () => {
  const repo = await server();
  const dev = new SyncClient(new NodeSqliteExecutor(':memory:'), local(repo), 'tablet');
  await dev.init();
  await dev.replicate({ categoryId: [3] }, 100);
  const localRepo = new SqlPartsRepository(dev.ex);
  const all = await localRepo.list({ limit: 500 });
  assert.equal(all.items.length, 100); // every 3rd of 300
  assert.ok(all.items.every((p) => p.category === 'Brake Pads'));
  assert.ok(all.items.every((p) => p.fitmentCount === 1));
  // FTS works on the device copy
  const hits = await localRepo.list({ q: 'z40' });
  assert.ok(hits.items.length > 0);
  // a second scope reuses reference rows without FK/REPLACE errors
  await dev.replicate({ brandId: [1] }, 100);
  assert.equal((await dev.scopes()).filter((s) => s.done).length, 2);
});

test('offline edit pushes, remote edit pulls, LWW converges', async () => {
  const repo = await server(60);
  const dev = new SyncClient(new NodeSqliteExecutor(':memory:'), local(repo), 'phone');
  await dev.init();
  await dev.replicate({}, 25);
  const [a, b] = (await new SqlPartsRepository(dev.ex).list({ limit: 2 })).items;

  // device edits A while offline
  await dev.mutate(a!.id, { status: 'hold', holdReason: 'LHD/RHD 미확인' });
  assert.equal(await dev.pendingCount(), 1);

  // someone else edits B on the server
  const office = new Hlc('office');
  const m: Mutation = { id: ulid(), entity: 'part', entityId: b!.id, patch: { stock: 0 }, hlc: office.tick(), origin: 'office' };
  assert.deepEqual((await repo.apply([m])).accepted, [m.id]);

  const r = await dev.sync();
  assert.equal(r.pushed, 1);
  assert.equal(await dev.pendingCount(), 0);
  assert.equal((await repo.get(a!.id))!.status, 'hold');
  assert.equal((await new SqlPartsRepository(dev.ex).get(b!.id))!.stock, 0);

  // stale write is rejected, newer one wins
  const stale: Mutation = { ...m, id: ulid(), patch: { stock: 99 }, hlc: '0000000000001:0000:old' };
  assert.equal((await repo.apply([stale])).rejected[0]!.reason, 'stale');
  // re-push of an applied mutation is idempotent
  assert.deepEqual((await repo.apply([m])).accepted, [m.id]);
});

test('keyset cursor pages cover every row exactly once', async () => {
  const repo = await server(250);
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const p = await repo.list({ limit: 40, sort: 'price_desc', cursor });
    p.items.forEach((x) => seen.add(x.id));
    cursor = p.nextCursor;
  } while (cursor);
  assert.equal(seen.size, 250);
});
