import { z } from 'zod';

/** The two process types the backend image runs as. */
export const ProcessTypeSchema = z.enum(['web', 'worker']);

/** A process type name: `web` or `worker`. */
export type ProcessType = z.infer<typeof ProcessTypeSchema>;

/** Result of one dependency check, and of the process as a whole. */
export const HealthCheckStatusSchema = z.enum(['ok', 'unavailable']);

/** `ok` when the check passed, `unavailable` otherwise. */
export type HealthCheckStatus = z.infer<typeof HealthCheckStatusSchema>;

/** Body of `GET /health` on the web and worker processes. */
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
