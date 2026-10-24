import { useSyncExternalStore } from 'react';
import type { CatalogueStats, Category, PartQuery, PartRow, Vehicle } from '@gomdori/core';
import { load } from './persist.ts';
import type { ContentCard } from './content.ts';

export interface OrderLine {
  part: PartRow;
  qty: number;
  addedAt: number;
}

/**
 * One tiny store shared by the DOM HUD and the WebGL scene. React reads it
 * with useSyncExternalStore; the render loop reads/writes `frame` directly
 * (no React re-render at 60 fps).
 */
export type LightPresetId = 'hangar' | 'sunset' | 'night' | 'showroom';
export type View = 'hangar' | 'analysis' | 'parts' | 'content' | 'market' | 'device';

export interface Garage {
  make: string;
  model: string;
  year: number | null;
  vehicles: Vehicle[];
  paint: string;
}

export interface LoadStage {
  id: 'link' | 'vehicle' | 'chassis' | 'shaders' | 'hud';
  label: string;
  done: boolean;
}

export type Quality = 'auto' | 'high' | 'medium' | 'low';

/** Viewer settings (persisted per browser). */
export interface Settings {
  quality: Quality;
  bloom: boolean;
  scanlines: boolean;
  chroma: boolean;
  particles: boolean;
  shake: boolean;
  reducedMotion: boolean;
  attract: boolean;
  volume: number;
  ambient: boolean;
  uiScale: number;
}

const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  bloom: true,
  scanlines: true,
  chroma: true,
  particles: true,
  shake: !reduce,
  reducedMotion: reduce,
  attract: true,
  volume: 0.6,
  ambient: false,
  uiScale: 1,
};

export interface HudState {
  view: View;
  booted: boolean;
  stages: LoadStage[];
  garage: Garage;
  stats: CatalogueStats | null;
  categories: Category[];
  /** parts fitting the garage vehicle, per system id */
  coverage: Record<string, number> | null;
  samples: Record<string, PartRow[]>;
  hoverCar: boolean;
  xrayLock: boolean;
  autoRotate: boolean;
  hovered: string | null;
  selected: string | null;
  openPart: PartRow | null;
  /** filter handed to the parts explorer when opened from the hangar */
  preset: PartQuery | null;
  /** set when running without an API: progress of the on-device demo catalogue */
  demo: { done: number; total: number; phase: string } | null;
  /** exploded view: systems pulled out of the body */
  explode: boolean;
  lightPreset: LightPresetId;
  /** photo mode: HUD hidden, depth of field on */
  photo: boolean;
  toasts: { id: number; text: string; kind: 'info' | 'ok' | 'warn' | 'bad' }[];
  muted: boolean;
  /** work order (parts list for a job), persisted per viewer */
  order: OrderLine[];
  orderOpen: boolean;
  paletteOpen: boolean;
  /** content planning cards (persisted per viewer) */
  content: ContentCard[];
  contentOpen: string | null;
  /** azimuth of the camera around the car, radians (minimap view cone) */
  azimuth: number;
  headlights: boolean;
  settings: Settings;
  settingsOpen: boolean;
  helpOpen: boolean;
  /** onboarding tour step, null when not running */
  tour: number | null;
  /** attract mode: no input for a while, camera goes cinematic */
  idle: boolean;
  /** recently opened parts (palette "recent" group) */
  recent: PartRow[];
}

const initial: HudState = {
  view: 'hangar',
  booted: false,
  stages: [
    { id: 'link', label: '카탈로그 링크 수립', done: false },
    { id: 'vehicle', label: '차량 데이터 수신', done: false },
    { id: 'chassis', label: '섀시·스켈레톤 생성', done: false },
    { id: 'shaders', label: '재질·셰이더 컴파일', done: false },
    { id: 'hud', label: '전술 HUD 초기화', done: false },
  ],
  garage: { make: 'Toyota', model: 'HiLux', year: 2018, vehicles: [], paint: '#1f5fa8' },
  stats: null,
  categories: [],
  coverage: null,
  samples: {},
  hoverCar: false,
  xrayLock: false,
  autoRotate: true,
  hovered: null,
  selected: null,
  openPart: null,
  preset: null,
  demo: null,
  explode: false,
  lightPreset: 'hangar',
  photo: false,
  toasts: [],
  muted: load('muted', false),
  order: load<OrderLine[]>('order', []),
  orderOpen: false,
  paletteOpen: false,
  content: [],
  contentOpen: null,
  azimuth: 0,
  headlights: false,
  settings: { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) },
  settingsOpen: false,
  helpOpen: false,
  tour: null,
  idle: false,
  recent: load<PartRow[]>('recent', []),
};

let state = initial;
const subs = new Set<() => void>();

export const hud = {
  get: () => state,
  set(patch: Partial<HudState> | ((s: HudState) => Partial<HudState>)) {
    const p = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...p };
    subs.forEach((f) => f());
  },
  stage(id: LoadStage['id']) {
    hud.set((s) => ({ stages: s.stages.map((x) => (x.id === id ? { ...x, done: true } : x)) }));
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
};

export function useHud<T>(sel: (s: HudState) => T): T {
  return useSyncExternalStore(hud.subscribe, () => sel(state));
}

/** Per-frame values written by the scene, read by overlays in their own rAF loop. */
export const frame = {
  /** 0..1 eased exploded-view amount (written by the car, read by hotspots/camera) */
  explode: 0,
  anchors: {} as Record<string, { x: number; y: number; visible: boolean }>,
  xray: 0,
  /** 0..1 camera punch, set on big events and decayed by the rig */
  punch: 0,
  /** clock time (s) of the last system selection: drives the floor shockwave */
  pulseAt: -10,
  pulseId: null as string | null,
  /** performance.now() of the last user input (attract mode) */
  lastInput: performance.now(),
  /** inputs before this time don't leave attract mode (manual start) */
  attractGrace: 0,
  width: 1,
  height: 1,
};

export const xrayActive = (s: HudState) => s.hoverCar || s.xrayLock || s.selected !== null;
