import type { PartQuery } from '@gomdori/core';
import { data } from '../data/index.ts';
import { SYSTEMS } from '../three/systems.ts';
import { hud } from './store.ts';

/** Leaf category ids for each system (via the catalogue's parent groups). */
export function leafIds(systemId: string): number[] {
  const def = SYSTEMS.find((s) => s.id === systemId);
  const cats = hud.get().categories;
  const parent = cats.find((c) => c.parentId === null && c.name === def?.group);
  return parent ? cats.filter((c) => c.parentId === parent.id).map((c) => c.id) : [];
}

export function systemOfCategory(categoryId: number): string | null {
  const cats = hud.get().categories;
  const leaf = cats.find((c) => c.id === categoryId);
  const parent = cats.find((c) => c.id === leaf?.parentId);
  return SYSTEMS.find((s) => s.group === parent?.name)?.id ?? null;
}

export function garageQuery(): PartQuery {
  const g = hud.get().garage;
  return { make: g.make, model: g.model, year: g.year ?? undefined };
}

/** Demo catalogue size when no API is reachable; `?demo=200000` overrides. */
const DEMO_PARTS = Math.min(1_000_000, Math.max(5_000, Number(new URLSearchParams(location.search).get('demo')) || 60_000));

export async function boot(): Promise<void> {
  if (!(await data.probeEdge())) {
    // Static deploy (e.g. Vercel) or API down: local-first fallback — build the catalogue on this device.
    hud.set({ demo: { done: 0, total: DEMO_PARTS, phase: 'reference' } });
    data.device.onDemo = (p) => hud.set({ demo: { done: p.done, total: p.total, phase: p.phase } });
    try {
      await data.device.demo(DEMO_PARTS);
      await data.refreshStatus();
    } catch (e) {
      console.error(e);
    }
  }
  try {
    const [stats, cats] = await Promise.all([data.run(null, (s) => s.stats()), data.run(null, (s) => s.categories())]);
    hud.set({ stats: stats.value, categories: cats.value });
  } catch (e) {
    console.error(e);
  }
  hud.stage('link');
  void data.refreshStatus();
  await loadGarage();
  hud.stage('hud');
}

let garageGen = 0;

/** Vehicle rows for the garage selection, then per-system coverage and sample parts. */
export async function loadGarage(): Promise<void> {
  const my = ++garageGen;
  const g = hud.get().garage;
  try {
    const all = (await data.run(null, (s) => s.vehicles(g.make, g.model))).value;
    const year = g.year;
    const match = year ? all.filter((v) => year >= v.yearFrom && year <= v.yearTo) : all;
    if (my !== garageGen) return;
    hud.set((s) => ({ garage: { ...s.garage, vehicles: match.length ? match : all } }));
  } catch (e) {
    console.error(e);
  }
  hud.stage('vehicle');
  hud.set({ coverage: null, samples: {} });
  const q = garageQuery();
  try {
    const rows = (await data.run(q, (s) => s.coverage(q))).value;
    if (my !== garageGen) return;
    const cov: Record<string, number> = Object.fromEntries(SYSTEMS.map((s) => [s.id, 0]));
    for (const r of rows) {
      const sys = systemOfCategory(r.categoryId);
      if (sys) cov[sys] = (cov[sys] ?? 0) + r.count;
    }
    hud.set({ coverage: cov });
  } catch (e) {
    console.error(e);
  }
  // sample parts per system for the leader-line labels and the info panel
  await Promise.all(
    SYSTEMS.map(async (sys) => {
      const ids = leafIds(sys.id);
      if (!ids.length) return;
      const sq: PartQuery = { ...q, categoryId: ids, status: ['active', 'hold'], limit: 8, sort: 'updated_desc' };
      try {
        const page = (await data.run(sq, (s) => s.list(sq))).value;
        if (my !== garageGen) return;
        hud.set((s) => ({ samples: { ...s.samples, [sys.id]: page.items } }));
      } catch {
        /* label just shows the count */
      }
    }),
  );
}
