import type { SqlExecutor } from './executor.ts';

/**
 * Catalogue schema (SQLite dialect — runs unchanged on node:sqlite, D1,
 * libSQL and sqlite-wasm).
 *
 * Scale notes for 1M+ parts / several M fitments:
 *  - `rid` integer PK keeps the B-tree compact; the public id is a ULID so any
 *    node can mint ids offline without collisions.
 *  - Every filter that the UI can combine with a sort has a composite
 *    `(filter, sortkey, id)` index so keyset pagination never sorts in memory.
 *  - Search is FTS5 *contentless* (no second copy of the text) with prefix
 *    indexes for type-ahead on part numbers.
 *  - `changes` is an append-only log that drives edge/device sync.
 */
export const SCHEMA_VERSION = 1;

export const CORE_DDL = /* sql */ `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS brands (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id         INTEGER PRIMARY KEY,
  make       TEXT NOT NULL,
  model      TEXT NOT NULL,
  year_from  INTEGER NOT NULL,
  year_to    INTEGER NOT NULL,
  engine     TEXT NOT NULL,
  body       TEXT NOT NULL,
  drive_side TEXT NOT NULL CHECK (drive_side IN ('RHD','LHD','ANY'))
);
CREATE INDEX IF NOT EXISTS vehicles_make_model ON vehicles(make, model, year_from);

CREATE TABLE IF NOT EXISTS parts (
  rid          INTEGER PRIMARY KEY,
  id           TEXT NOT NULL UNIQUE,
  sku          TEXT NOT NULL,
  mpn          TEXT NOT NULL,
  gtin         TEXT,
  brand_id     INTEGER NOT NULL REFERENCES brands(id),
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  name         TEXT NOT NULL,
  price_cents  INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'AUD',
  stock        INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL CHECK (status IN ('active','hold','draft','discontinued')),
  evidence     TEXT NOT NULL CHECK (evidence IN ('A','B','U','H')),
  rights       TEXT NOT NULL CHECK (rights IN ('own','licensed','unknown')),
  hold_reason  TEXT,
  updated_at   INTEGER NOT NULL,
  hlc          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS parts_sku        ON parts(sku);
CREATE INDEX IF NOT EXISTS parts_mpn        ON parts(mpn);
CREATE INDEX IF NOT EXISTS parts_gtin       ON parts(gtin) WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS parts_cat_id     ON parts(category_id, id);
CREATE INDEX IF NOT EXISTS parts_brand_id   ON parts(brand_id, id);
CREATE INDEX IF NOT EXISTS parts_status_id  ON parts(status, id);
CREATE INDEX IF NOT EXISTS parts_updated    ON parts(updated_at, id);
CREATE INDEX IF NOT EXISTS parts_price      ON parts(price_cents, id);
CREATE INDEX IF NOT EXISTS parts_cat_price  ON parts(category_id, price_cents, id);
CREATE INDEX IF NOT EXISTS parts_cat_upd    ON parts(category_id, updated_at, id);

CREATE TABLE IF NOT EXISTS fitments (
  part_id    TEXT NOT NULL,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  position   TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  PRIMARY KEY (part_id, vehicle_id, position)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS fitments_vehicle ON fitments(vehicle_id, part_id);

CREATE TABLE IF NOT EXISTS changes (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op        TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  hlc       TEXT NOT NULL,
  ts        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS changes_entity ON changes(entity_id, seq);

CREATE TABLE IF NOT EXISTS applied_mutations (
  id         TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS stats_cache (
  key         TEXT PRIMARY KEY,
  json        TEXT NOT NULL,
  computed_at INTEGER NOT NULL
);
`;

/** Search index. Created after bulk loads (much faster than per-row triggers). */
export const SEARCH_DDL = /* sql */ `
CREATE VIRTUAL TABLE IF NOT EXISTS parts_fts USING fts5(
  name, codes, brand,
  content = '',
  contentless_delete = 1,
  tokenize = "unicode61 remove_diacritics 2 tokenchars '-'",
  prefix = '2 3 4'
);

CREATE TRIGGER IF NOT EXISTS parts_ai AFTER INSERT ON parts BEGIN
  INSERT INTO parts_fts(rowid, name, codes, brand)
  VALUES (new.rid, new.name, ${codesExpr('new')}, (SELECT name FROM brands WHERE id = new.brand_id));
END;
CREATE TRIGGER IF NOT EXISTS parts_ad AFTER DELETE ON parts BEGIN
  DELETE FROM parts_fts WHERE rowid = old.rid;
END;
CREATE TRIGGER IF NOT EXISTS parts_au AFTER UPDATE OF name, mpn, sku, gtin, brand_id ON parts BEGIN
  DELETE FROM parts_fts WHERE rowid = old.rid;
  INSERT INTO parts_fts(rowid, name, codes, brand)
  VALUES (new.rid, new.name, ${codesExpr('new')}, (SELECT name FROM brands WHERE id = new.brand_id));
END;
`;

/**
 * Part numbers are searched both as written ("CUK 2939/1") and squashed
 * ("cuk29391") so a customer can type either.
 */
function codesExpr(row: string): string {
  const squash = (col: string) => `replace(replace(replace(replace(${row}.${col}, ' ', ''), '/', ''), '-', ''), '.', '')`;
  return `${row}.mpn || ' ' || ${squash('mpn')} || ' ' || ${row}.sku || ' ' || coalesce(${row}.gtin, '')`;
}

export async function hasSearchIndex(ex: SqlExecutor): Promise<boolean> {
  const r = await ex.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'parts_fts'`);
  return r.length > 0;
}

/** Idempotent migration for an empty or existing database. */
export async function migrate(ex: SqlExecutor): Promise<void> {
  await ex.exec(CORE_DDL);
  await ex.exec(SEARCH_DDL);
  await ex.run(`INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [
    String(SCHEMA_VERSION),
  ]);
}

/** After a bulk load done without triggers: build the search index in one pass. */
export async function buildSearchIndex(ex: SqlExecutor): Promise<void> {
  await ex.exec(`DROP TRIGGER IF EXISTS parts_ai; DROP TRIGGER IF EXISTS parts_ad; DROP TRIGGER IF EXISTS parts_au; DROP TABLE IF EXISTS parts_fts;`);
  await ex.exec(SEARCH_DDL.split('CREATE TRIGGER')[0]!);
  await ex.run(
    `INSERT INTO parts_fts(rowid, name, codes, brand)
     SELECT p.rid, p.name, ${codesExpr('p')}, b.name FROM parts p JOIN brands b ON b.id = p.brand_id`,
  );
  await ex.exec(SEARCH_DDL);
  await ex.exec(`INSERT INTO parts_fts(parts_fts) VALUES ('optimize')`);
}

/** Secondary indexes (everything except PKs/UNIQUE), parsed from CORE_DDL so the list never drifts. */
export const SECONDARY_INDEXES = [...CORE_DDL.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((m) => m[1]!);

/**
 * Bulk-load mode: drop secondary indexes and search triggers so inserts only
 * touch the primary B-trees, then rebuild everything in sorted passes.
 * On storage where every dirty page costs real I/O (OPFS, mobile flash) this
 * turns an O(rows × indexes) random-write load into a few sequential builds.
 */
export async function beginBulkLoad(ex: SqlExecutor): Promise<void> {
  await ex.exec(SECONDARY_INDEXES.map((i) => `DROP INDEX IF EXISTS ${i};`).join('\n'));
  await ex.exec(`DROP TRIGGER IF EXISTS parts_ai; DROP TRIGGER IF EXISTS parts_ad; DROP TRIGGER IF EXISTS parts_au;`);
}

export async function endBulkLoad(ex: SqlExecutor): Promise<void> {
  await ex.exec(CORE_DDL); // IF NOT EXISTS → recreates only the dropped indexes
  await buildSearchIndex(ex);
  await ex.exec(`ANALYZE`);
}
