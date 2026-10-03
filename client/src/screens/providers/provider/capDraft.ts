import type { CapLengthUnit, CapResetMode, CapUnit, CapWindow } from '@tbn/contracts';
import { isoOfLocalInput, localInputOf } from '@/lib/forms/dates';
import { numberOrNull, numberText } from '@/lib/forms/numbers';

/** The cap window form, as typed. */
export interface CapDraft {
  name: string;
  length_count: string;
  length_unit: CapLengthUnit;
  reset_mode: CapResetMode;
  anchor_at: string;
  unit: CapUnit;
  limit: string;
  threshold_percent: string;
  enforced: boolean;
  model_id: string;
}

/** A new cap window: five rolling hours of tokens, shown but not enforced. */
export const EMPTY_CAP_DRAFT: CapDraft = {
  name: '',
  length_count: '5',
  length_unit: 'hour',
  reset_mode: 'rolling',
  anchor_at: '',
  unit: 'tokens',
  limit: '',
  threshold_percent: '',
  enforced: false,
  model_id: '',
};

/** The form of an existing cap window. */
export function capDraftOf(window: CapWindow): CapDraft {
  return {
    name: window.name,
    length_count: String(window.length_count),
    length_unit: window.length_unit,
    reset_mode: window.reset_mode,
    anchor_at: localInputOf(window.anchor_at),
    unit: window.unit,
    limit: String(window.limit),
    threshold_percent: numberText(window.threshold_percent),
    enforced: window.enforced,
    model_id: window.model_id ?? '',
  };
}

/** The request body of the form. A rolling window has no anchor. */
export function capInput(draft: CapDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    length_count: numberOrNull(draft.length_count),
    length_unit: draft.length_unit,
    reset_mode: draft.reset_mode,
    anchor_at: draft.reset_mode === 'fixed' ? isoOfLocalInput(draft.anchor_at) : null,
    unit: draft.unit,
    limit: numberOrNull(draft.limit),
    threshold_percent: numberOrNull(draft.threshold_percent),
    enforced: draft.enforced,
    model_id: draft.model_id.length > 0 ? draft.model_id : null,
  };
}
