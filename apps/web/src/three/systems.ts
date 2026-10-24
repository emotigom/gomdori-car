import type { CarSpec } from './carSpec.ts';

/**
 * Vehicle systems = the 13 top-level category groups of the catalogue, each
 * pinned to a physical location on the car. The 3D model, the leader-line
 * labels, the command card and the analysis radar all key off this list.
 */
export interface SystemDef {
  id: string;
  /** Parent category name in the catalogue (categories.parent_id = this group). */
  group: string;
  ko: string;
  code: string;
  hotkey: string;
  color: string;
  anchor: (s: CarSpec) => [number, number, number];
}

export const SYSTEMS: SystemDef[] = [
  { id: 'engine', group: 'Engine', ko: '엔진', code: 'ENG-01', hotkey: 'E', color: '#4fd8ff', anchor: (s) => [s.frontAxle - 0.15, s.engineY + 0.05, 0] },
  { id: 'cooling', group: 'Cooling', ko: '냉각', code: 'CLG-02', hotkey: 'C', color: '#6ab8ff', anchor: (s) => [s.length / 2 - 0.32, s.engineY, 0] },
  { id: 'belts', group: 'Belts & Hoses', ko: '벨트·호스', code: 'BLT-03', hotkey: 'B', color: '#58f0d0', anchor: (s) => [s.frontAxle + 0.2, s.engineY + 0.02, 0.16] },
  { id: 'ignition', group: 'Ignition', ko: '점화', code: 'IGN-04', hotkey: 'I', color: '#ffd84f', anchor: (s) => [s.frontAxle - 0.2, s.engineY + 0.3, 0.05] },
  { id: 'filters', group: 'Filters', ko: '필터', code: 'FLT-05', hotkey: 'F', color: '#9cff6a', anchor: (s) => [s.frontAxle - 0.05, s.engineY + 0.22, -s.width * 0.27] },
  { id: 'electrical', group: 'Electrical', ko: '전장', code: 'ELC-06', hotkey: 'Q', color: '#ffb03a', anchor: (s) => [s.frontAxle - 0.45, s.engineY + 0.17, s.width * 0.3] },
  { id: 'fluids', group: 'Oils & Fluids', ko: '오일·유체', code: 'FLD-07', hotkey: 'O', color: '#c58cff', anchor: (s) => [s.frontAxle - 0.2, s.engineY - 0.3, 0] },
  { id: 'brakes', group: 'Brakes', ko: '브레이크', code: 'BRK-08', hotkey: 'K', color: '#ff5a4f', anchor: (s) => [s.frontAxle, s.wheelR, s.track / 2 - 0.05] },
  { id: 'suspension', group: 'Suspension', ko: '서스펜션', code: 'SUS-09', hotkey: 'S', color: '#4fffa8', anchor: (s) => [s.rearAxle, s.wheelR + 0.35, -(s.track / 2 - 0.18)] },
  { id: 'steering', group: 'Steering', ko: '조향', code: 'STR-10', hotkey: 'R', color: '#ff8adf', anchor: (s) => [s.cowlX - 0.35, s.belt - 0.05, -s.width * 0.2] },
  { id: 'drivetrain', group: 'Drivetrain', ko: '구동계', code: 'DRV-11', hotkey: 'D', color: '#ffa06a', anchor: (s) => [(s.frontAxle + s.rearAxle) / 2, s.sill + 0.02, 0] },
  { id: 'lighting', group: 'Lighting', ko: '조명', code: 'LGT-12', hotkey: 'L', color: '#e8f6ff', anchor: (s) => [s.length / 2 - 0.08, s.bumperTop + 0.08, s.width * 0.36] },
  { id: 'wipers', group: 'Wipers', ko: '와이퍼', code: 'WPR-13', hotkey: 'W', color: '#7ae0ff', anchor: (s) => [s.cowlX + 0.02, s.belt + 0.04, s.width * 0.1] },
];

export const SYSTEM_BY_ID = Object.fromEntries(SYSTEMS.map((s) => [s.id, s])) as Record<string, SystemDef>;

/** Where a system's assembly moves in the exploded view (k = 0..1). */
export function explodeOffset(def: SystemDef, s: CarSpec, k: number): [number, number, number] {
  const [x, y, z] = def.anchor(s);
  const side = Math.sign(z) || (def.id === 'drivetrain' || def.id === 'fluids' ? 0 : 1);
  return [x * 0.35 * k, (0.9 + Math.max(0, y - s.sill) * 0.6) * k, (z * 1.4 + side * 0.55) * k];
}
