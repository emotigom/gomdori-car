import { ulid, type Brand, type Category, type Fitment, type Part, type Vehicle } from '@gomdori/core';
import { BRANDS, CATEGORIES, HOLD_REASONS, MODELS } from './catalog.ts';

/**
 * Deterministic synthetic catalogue, shared by the Node seed tool (1M rows
 * into data/parts.db) and the browser worker (a demo catalogue generated
 * on-device when no API is reachable, e.g. a static Vercel deploy).
 * Same seed → same catalogue on every machine.
 */
export const DEFAULT_SEED = 20261019;

export function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoReference {
  brands: Brand[];
  categories: Category[];
  vehicles: Vehicle[];
  /** first leaf category id (leaves follow the group rows) */
  leafBase: number;
}

export function demoReference(seed = DEFAULT_SEED): DemoReference {
  const rnd = mulberry32(seed ^ 0x5eed);
  const brands = BRANDS.map((name, i) => ({ id: i + 1, name }));
  const groups = [...new Set(CATEGORIES.map((c) => c[0]))];
  const categories: Category[] = groups.map((name, i) => ({ id: i + 1, name, parentId: null }));
  const leafBase = groups.length;
  CATEGORIES.forEach(([g, leaf], i) => categories.push({ id: leafBase + i + 1, name: leaf, parentId: groups.indexOf(g) + 1 }));
  const vehicles: Vehicle[] = [];
  let id = 0;
  for (const [make, model, y0, y1, engines, body] of MODELS)
    for (const engine of engines)
      for (let y = y0; y <= y1; y += 3) {
        const yearTo = Math.min(y + 2, y1);
        vehicles.push({ id: ++id, make, model, yearFrom: y, yearTo, engine, body, driveSide: 'RHD' });
        if (rnd() < 0.15) vehicles.push({ id: ++id, make, model, yearFrom: y, yearTo, engine, body, driveSide: 'LHD' });
      }
  return { brands, categories, vehicles, leafBase };
}

const START = Date.UTC(2023, 0, 1);
const SPAN = Date.UTC(2026, 9, 19) - START;

/** Yields one part and its fitments at a time, so callers can batch however suits their store. */
export function* demoParts(n: number, ref: DemoReference, seed = DEFAULT_SEED): Generator<{ part: Part; fitments: Fitment[] }> {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const weighted = <T,>(pairs: [T, number][]): T => {
    let r = rnd();
    for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
    return pairs[pairs.length - 1]![0];
  };
  const V = ref.vehicles.length;
  for (let i = 1; i <= n; i++) {
    const brandIdx = Math.floor(Math.pow(rnd(), 1.6) * BRANDS.length);
    const brand = BRANDS[brandIdx]!;
    const catIdx = Math.floor(rnd() * CATEGORIES.length);
    const [, leaf, [lo, hi], positions] = CATEGORIES[catIdx]!;
    const updated = START + Math.floor(rnd() * SPAN);
    // ids ascend with i (ULID time = catalogue order), so loads append to the PK B-trees
    // instead of writing random pages — 5–10× faster on OPFS / mobile flash.
    const id = ulid(START + i * 1000, rnd);
    const prefix = brand.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase();
    const mpn = `${prefix}${100 + Math.floor(rnd() * 9900)}${rnd() < 0.3 ? '/' + (1 + Math.floor(rnd() * 3)) : ''}${rnd() < 0.2 ? '-' + pick(['A', 'B', 'HD', 'XL']) : ''}`;
    const gtin = rnd() < 0.72 ? '9' + String(Math.floor(rnd() * 1e12)).padStart(12, '0') : null;
    const status = weighted<Part['status']>([['active', 0.88], ['hold', 0.04], ['draft', 0.06], ['discontinued', 0.02]]);
    const evidence = weighted<Part['evidence']>([['A', 0.35], ['B', 0.3], ['U', 0.3], ['H', 0.05]]);
    const rights = weighted<Part['rights']>([['own', 0.2], ['licensed', 0.25], ['unknown', 0.55]]);
    const priceCents = Math.round((lo + Math.pow(rnd(), 1.8) * (hi - lo)) * 100) - 5;
    const stock = rnd() < 0.18 ? 0 : Math.floor(Math.pow(rnd(), 2) * 120);
    const part: Part = {
      id,
      sku: `MS-${String(i).padStart(7, '0')}`,
      mpn,
      gtin,
      brandId: brandIdx + 1,
      categoryId: ref.leafBase + catIdx + 1,
      name: `${brand} ${leaf} ${mpn}`,
      priceCents,
      currency: 'AUD',
      stock,
      status,
      evidence,
      rights,
      holdReason: status === 'hold' ? pick(HOLD_REASONS) : null,
      updatedAt: updated,
      hlc: `${String(updated).padStart(13, '0')}:0000:seed`,
    };
    // 0–6 vehicles, clustered on one model line (how real catalogues look)
    const nFit = weighted<number>([[0, 0.08], [1, 0.27], [2, 0.3], [3, 0.18], [4, 0.1], [6, 0.07]]);
    const fitments: Fitment[] = [];
    if (nFit) {
      const base = 1 + Math.floor(rnd() * V);
      const seen = new Set<string>();
      for (let k = 0; k < nFit; k++) {
        const vehicleId = Math.min(V, base + k);
        const position = pick(positions);
        const key = `${vehicleId}|${position}`;
        if (seen.has(key)) continue;
        seen.add(key);
        fitments.push({ partId: id, vehicleId, position, sourceUrl: evidence === 'A' ? `https://catalogue.example/${prefix.toLowerCase()}/${mpn}` : null });
      }
    }
    yield { part, fitments };
  }
}
