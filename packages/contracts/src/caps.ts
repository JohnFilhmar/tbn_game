import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';
import { ModelIdSchema } from './providers';

/** The unit a cap window's length is counted in. */
export const CapLengthUnitSchema = z.enum(['hour', 'day', 'week', 'month']);

/** `hour`, `day`, `week` or `month`. */
export type CapLengthUnit = z.infer<typeof CapLengthUnitSchema>;

/** Rolling windows cover the last length up to now; fixed windows step from an anchor time. */
export const CapResetModeSchema = z.enum(['rolling', 'fixed']);

/** `rolling` or `fixed`. */
export type CapResetMode = z.infer<typeof CapResetModeSchema>;

/** What a cap window counts: tokens, requests, or money at the owner's prices. */
export const CapUnitSchema = z.enum(['tokens', 'requests', 'money']);

/** `tokens`, `requests` or `money`. */
export type CapUnit = z.infer<typeof CapUnitSchema>;

/** Where a window's usage stands against its threshold and its limit. */
export const CapWindowStateSchema = z.enum(['ok', 'past_threshold', 'at_limit']);

/** `ok`, `past_threshold` or `at_limit`. */
export type CapWindowState = z.infer<typeof CapWindowStateSchema>;

/**
 * A usage cap on one provider key, counted by the runtime from its own usage records. A window
 * with `enforced` off only shows usage. `threshold_percent` null uses the owner's default for the
 * window's place among the key's windows; `model_id` null counts every model on the key.
 */
export const CapWindowSchema = z.strictObject({
  id: IdSchema,
  provider_id: IdSchema,
  name: z.string().trim().min(1).max(100),
  length_count: z.number().int().min(1).max(1_000),
  length_unit: CapLengthUnitSchema,
  reset_mode: CapResetModeSchema,
  anchor_at: DateTimeSchema.nullable(),
  unit: CapUnitSchema,
  limit: z.number().positive().max(1e15),
  threshold_percent: z.number().int().min(1).max(100).nullable(),
  enforced: z.boolean(),
  model_id: ModelIdSchema.nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** A cap window as the API returns it. */
export type CapWindow = z.infer<typeof CapWindowSchema>;

/**
 * Body of `POST /providers/:id/cap_windows`. A fixed window needs `anchor_at`; enforcement starts
 * off unless the owner turns it on.
 */
export const CreateCapWindowSchema = CapWindowSchema.pick({
  name: true,
  length_count: true,
  length_unit: true,
  reset_mode: true,
  anchor_at: true,
  unit: true,
  limit: true,
  threshold_percent: true,
  enforced: true,
  model_id: true,
}).partial({ anchor_at: true, threshold_percent: true, enforced: true, model_id: true });

/** Body of `POST /providers/:id/cap_windows`. */
export type CreateCapWindow = z.infer<typeof CreateCapWindowSchema>;

/** Body of `PATCH /providers/:id/cap_windows/:window_id`. */
export const UpdateCapWindowSchema = CreateCapWindowSchema.partial();

/** Body of `PATCH /providers/:id/cap_windows/:window_id`. */
export type UpdateCapWindow = z.infer<typeof UpdateCapWindowSchema>;

/**
 * A cap window with its live usage: the effective threshold, what was used since `window_start`,
 * when a fixed window resets (null for rolling windows) and the resulting state.
 */
export const CapWindowStatusSchema = CapWindowSchema.extend({
  effective_threshold_percent: z.number().int().min(1).max(100),
  used: z.number().min(0),
  window_start: DateTimeSchema,
  resets_at: DateTimeSchema.nullable(),
  state: CapWindowStateSchema,
});

/** A cap window with its live usage. */
export type CapWindowStatus = z.infer<typeof CapWindowStatusSchema>;
