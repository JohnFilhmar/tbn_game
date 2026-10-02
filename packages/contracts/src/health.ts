import { z } from 'zod';

/**
 * The process types the backend image runs as: the web process, the worker, the sandbox launcher
 * and the egress proxy.
 */
export const ProcessTypeSchema = z.enum(['web', 'worker', 'sandbox', 'egress_proxy']);

/** A process type name. */
export type ProcessType = z.infer<typeof ProcessTypeSchema>;

/** Result of one dependency check, and of the process as a whole. */
export const HealthCheckStatusSchema = z.enum(['ok', 'unavailable']);

/** `ok` when the check passed, `unavailable` otherwise. */
export type HealthCheckStatus = z.infer<typeof HealthCheckStatusSchema>;

/** Body of `GET /health` on every process. */
export const HealthResponseSchema = z.strictObject({
  status: HealthCheckStatusSchema,
  process_type: ProcessTypeSchema,
  commit_sha: z.string().min(1),
  checks: z.strictObject({
    database: HealthCheckStatusSchema,
  }),
});

/** Body of `GET /health`. The status is `ok` only when every check is `ok`. */
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
