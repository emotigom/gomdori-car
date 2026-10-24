/**
 * Parametric body specs (metres). Every body style the catalogue's
 * `vehicles.body` column uses gets a silhouette; the same numbers place the
 * wheels, the chassis skeleton and every system anchor, so a Ute and a Hatch
 * put their brakes, battery and radiator in believable places.
 *
 * Axes: +x = front, +y = up, z = across (right side is +z). Ground is y = 0.
 */
export type BodyType = 'Ute' | 'SUV' | 'Sedan' | 'Hatch' | 'Wagon' | 'Coupe';

export interface CarSpec {
  body: BodyType;
  length: number;
  width: number;
  wheelbase: number;
  frontOverhang: number;
  wheelR: number;
  track: number;
  sill: number;
  bumperTop: number;
  hoodFront: number;
  belt: number;
  roof: number;
  cowlX: number;
  wsTopX: number;
  roofRearX: number;
  backBaseX: number;
  deckY: number;
  /** Ute tray: from x to x, rail height. */
  bed?: { x0: number; x1: number; rail: number };
  frontAxle: number;
  rearAxle: number;
  /** centre height of the engine block (kept under the bonnet for every body) */
  engineY: number;
}

type Base = Omit<CarSpec, 'frontAxle' | 'rearAxle' | 'track' | 'engineY'>;

const BASES: Record<BodyType, Base> = {
  Sedan: { body: 'Sedan', length: 4.85, width: 1.84, wheelbase: 2.82, frontOverhang: 0.95, wheelR: 0.34, sill: 0.27, bumperTop: 0.62, hoodFront: 0.8, belt: 0.98, roof: 1.45, cowlX: 0.78, wsTopX: -0.12, roofRearX: -1.05, backBaseX: -1.78, deckY: 1.0 },
  Hatch: { body: 'Hatch', length: 4.32, width: 1.8, wheelbase: 2.65, frontOverhang: 0.88, wheelR: 0.33, sill: 0.27, bumperTop: 0.6, hoodFront: 0.78, belt: 0.98, roof: 1.47, cowlX: 0.62, wsTopX: -0.25, roofRearX: -1.62, backBaseX: -2.04, deckY: 0.98 },
  Wagon: { body: 'Wagon', length: 4.88, width: 1.84, wheelbase: 2.78, frontOverhang: 0.95, wheelR: 0.35, sill: 0.28, bumperTop: 0.62, hoodFront: 0.8, belt: 1.0, roof: 1.53, cowlX: 0.72, wsTopX: -0.2, roofRearX: -2.22, backBaseX: -2.38, deckY: 1.0 },
  SUV: { body: 'SUV', length: 4.78, width: 1.9, wheelbase: 2.76, frontOverhang: 0.92, wheelR: 0.4, sill: 0.4, bumperTop: 0.78, hoodFront: 1.0, belt: 1.15, roof: 1.76, cowlX: 0.75, wsTopX: -0.1, roofRearX: -2.18, backBaseX: -2.32, deckY: 1.15 },
  Ute: { body: 'Ute', length: 5.32, width: 1.86, wheelbase: 3.08, frontOverhang: 0.92, wheelR: 0.4, sill: 0.44, bumperTop: 0.82, hoodFront: 1.05, belt: 1.15, roof: 1.82, cowlX: 0.95, wsTopX: 0.12, roofRearX: -0.58, backBaseX: -0.66, deckY: 1.15, bed: { x0: -0.72, x1: -2.62, rail: 1.16 } },
  Coupe: { body: 'Coupe', length: 4.5, width: 1.85, wheelbase: 2.45, frontOverhang: 1.0, wheelR: 0.34, sill: 0.22, bumperTop: 0.55, hoodFront: 0.72, belt: 0.9, roof: 1.3, cowlX: 0.5, wsTopX: -0.45, roofRearX: -0.95, backBaseX: -1.95, deckY: 0.9 },
};

export function carSpec(body: string | undefined): CarSpec {
  const b = BASES[(body as BodyType) ?? 'Ute'] ?? BASES.Ute;
  const frontAxle = b.length / 2 - b.frontOverhang;
  return { ...b, frontAxle, rearAxle: frontAxle - b.wheelbase, track: b.width - 0.22, engineY: Math.min(b.sill + 0.38, (b.hoodFront + b.belt) / 2 - 0.48) };
}

export const BODY_KO: Record<BodyType, string> = { Ute: '유트(픽업)', SUV: 'SUV', Sedan: '세단', Hatch: '해치백', Wagon: '왜건', Coupe: '쿠페' };
