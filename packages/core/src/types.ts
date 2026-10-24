/**
 * Domain model for the demo parts catalogue.
 *
 * Every field that matters for a content or purchase decision has a home
 * here: evidence grade (A/B/U/H), asset rights, and a HOLD status for
 * product-truth conflicts (MPN/GTIN vs. spec mismatch, LHD/RHD, kit vs. single).
 */

/** Evidence grades: A = source-confirmed, B = reported, U = unverified, H = hypothesis. */
export type EvidenceGrade = 'A' | 'B' | 'U' | 'H';

/** Publish state. `hold` = blocked by a claim / fitment / identity conflict. */
export type PartStatus = 'active' | 'hold' | 'draft' | 'discontinued';

/** Whether imagery/copy for this part may be reused commercially on social channels. */
export type RightsStatus = 'own' | 'licensed' | 'unknown';

export type DriveSide = 'RHD' | 'LHD' | 'ANY';

export interface Brand {
  id: number;
  name: string;
}

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
}

export interface Vehicle {
  id: number;
  make: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  engine: string;
  body: string;
  driveSide: DriveSide;
}

export interface Part {
  /** Stable, globally unique, sortable id (ULID). Safe to mint on any device. */
  id: string;
  /** Internal store SKU. Never conflated with the manufacturer MPN. */
  sku: string;
  /** Manufacturer part number. */
  mpn: string;
  gtin: string | null;
  brandId: number;
  categoryId: number;
  name: string;
  priceCents: number;
  currency: 'AUD';
  stock: number;
  status: PartStatus;
  evidence: EvidenceGrade;
  rights: RightsStatus;
  /** Optional free-text reason when status = hold. */
  holdReason: string | null;
  /** Epoch ms of last change (display only — ordering uses `hlc`). */
  updatedAt: number;
  /** Hybrid logical clock of the last write; drives last-writer-wins merges. */
  hlc: string;
}

/** Row shape returned to list views: part + denormalised labels. */
export interface PartRow extends Part {
  brand: string;
  category: string;
  fitmentCount: number;
}

export interface Fitment {
  partId: string;
  vehicleId: number;
  position: string;
  /** URL of the manufacturer source that supports this fitment claim. */
  sourceUrl: string | null;
}

export interface FitmentRow extends Fitment {
  vehicle: Vehicle;
}
