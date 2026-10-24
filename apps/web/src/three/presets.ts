import type { LightPresetId } from '../hud/store.ts';

/**
 * Lighting moods. Everything that colours the hangar reads from one preset,
 * so a switch re-tints environment reflections, lights, beams, floor grid,
 * particles and bloom together.
 */
export interface LightPreset {
  id: LightPresetId;
  ko: string;
  bg: string;
  fog: [number, number];
  env: { top: string; front: string; left: string; right: string; ring: string; accent: string; k: number };
  key: { color: string; intensity: number };
  rimA: string;
  rimB: string;
  ambient: number;
  beam: string;
  under: string;
  grid: string;
  sparkle: string;
  bloom: number;
}

export const PRESETS: Record<LightPresetId, LightPreset> = {
  hangar: {
    id: 'hangar', ko: '격납고', bg: '#03070b', fog: [14, 34],
    env: { top: '#e8f4ff', front: '#dfefff', left: '#4fd8ff', right: '#ffffff', ring: '#7ab8ff', accent: '#ffb03a', k: 1 },
    key: { color: '#f3f8ff', intensity: 3 }, rimA: '#4fd8ff', rimB: '#3a7dff', ambient: 0.12,
    beam: '#4fb8ff', under: '#1f9fff', grid: '#2fa8e0', sparkle: '#7fd8ff', bloom: 0.9,
  },
  sunset: {
    id: 'sunset', ko: '석양', bg: '#0e0605', fog: [12, 30],
    env: { top: '#ffd2a8', front: '#ff9a5c', left: '#ff6a3a', right: '#ffe0c0', ring: '#ff7a9a', accent: '#ffb03a', k: 1.1 },
    key: { color: '#ffb27a', intensity: 3.4 }, rimA: '#ff7a3a', rimB: '#ff3a6a', ambient: 0.16,
    beam: '#ffa060', under: '#ff7a2a', grid: '#ff8a4f', sparkle: '#ffc890', bloom: 1.05,
  },
  night: {
    id: 'night', ko: '경보', bg: '#060103', fog: [10, 26],
    env: { top: '#ff6a6a', front: '#5a1010', left: '#ff2a2a', right: '#ff7a3a', ring: '#ff2a5a', accent: '#ffb03a', k: 0.75 },
    key: { color: '#ff5a5a', intensity: 1.6 }, rimA: '#ff2a2a', rimB: '#ff6a00', ambient: 0.05,
    beam: '#ff3a3a', under: '#ff2a2a', grid: '#ff4f4f', sparkle: '#ff8a8a', bloom: 1.25,
  },
  showroom: {
    id: 'showroom', ko: '쇼룸', bg: '#141a20', fog: [18, 44],
    env: { top: '#ffffff', front: '#ffffff', left: '#e8f0ff', right: '#ffffff', ring: '#ffffff', accent: '#ffffff', k: 1.6 },
    key: { color: '#ffffff', intensity: 4 }, rimA: '#dfe8ff', rimB: '#ffffff', ambient: 0.35,
    beam: '#e8f0ff', under: '#9fc8ff', grid: '#8aa4b8', sparkle: '#ffffff', bloom: 0.6,
  },
};
