import type { CapLengthUnit, CapResetMode, CapUnit } from '@tbn/contracts';

/** Fields of a cap window as written. */
export interface CapWindowWrite {
  name: string;
  length_count: number;
  length_unit: CapLengthUnit;
  reset_mode: CapResetMode;
  anchor_at: Date | null;
  unit: CapUnit;
  limit: number;
  threshold_percent: number | null;
  enforced: boolean;
  model_id: string | null;
}

/** A cap window row. */
export interface CapWindowRecord extends CapWindowWrite {
  id: string;
  owner_id: string;
  provider_id: string;
  created_at: Date;
  updated_at: Date;
}
