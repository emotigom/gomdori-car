import type { Quality } from '../hud/store.ts';

/**
 * Render quality tiers. "auto" picks medium on integrated / mobile GPUs
 * (Intel UHD/Iris, AMD APU "Radeon Graphics", Apple-less mobile chips) and
 * high elsewhere; the viewer can override it in settings.
 */
export interface Tier {
  id: Exclude<Quality, 'auto'>;
  dpr: [number, number];
  msaa: number;
  shadow: number;
  reflector: number | null; // null = plain floor, no mirror pass
}

export const TIERS: Record<Tier['id'], Tier> = {
  high: { id: 'high', dpr: [1, 2], msaa: 4, shadow: 2048, reflector: 1024 },
  medium: { id: 'medium', dpr: [1, 1.5], msaa: 2, shadow: 1024, reflector: 512 },
  low: { id: 'low', dpr: [1, 1], msaa: 0, shadow: 512, reflector: null },
};

let gpu: string | null = null;
export function gpuName(): string {
  if (gpu !== null) return gpu;
  gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* no WebGL info: treat as unknown */
  }
  return gpu;
}

export function isIntegrated(name = gpuName()) {
  return /intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|mali|adreno|powervr|swiftshader|llvmpipe/i.test(name);
}

export function resolveTier(q: Quality): Tier {
  if (q !== 'auto') return TIERS[q];
  const mobile = matchMedia?.('(pointer: coarse)').matches;
  return TIERS[isIntegrated() || mobile ? 'medium' : 'high'];
}
