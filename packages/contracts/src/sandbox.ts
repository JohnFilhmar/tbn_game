import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

/** An agent's shell command, or a system job such as a git operation on a canonical repository. */
export const SandboxJobKindSchema = z.enum(['agent', 'system']);

/** `agent` or `system`. */
export type SandboxJobKind = z.infer<typeof SandboxJobKindSchema>;

/** Where a sandbox job is. `lost` means the launcher never reported on it. */
export const SandboxJobStatusSchema = z.enum([
  'queued',
  'running',
  'done',
  'failed',
  'timed_out',
  'lost',
]);

/** A sandbox job status. */
export type SandboxJobStatus = z.infer<typeof SandboxJobStatusSchema>;

/** A directory of the workspace volume mounted into the sandbox container. */
export const SandboxMountSchema = z.strictObject({
  /** Relative to the root of the workspace volume. */
  subpath: z.string().min(1).max(500),
  target: z.string().startsWith('/').max(200),
  read_only: z.boolean(),
});

/** A sandbox mount. */
export type SandboxMount = z.infer<typeof SandboxMountSchema>;

/** The limits of one sandbox container. The launcher caps them with its own maxima. */
export const SandboxLimitsSchema = z.strictObject({
  cpus: z.number().min(0.1).max(64),
  memory_mb: z.number().int().min(64).max(262_144),
  scratch_mb: z.number().int().min(16).max(65_536),
  timeout_seconds: z.number().int().min(1).max(86_400),
  pids: z.number().int().min(16).max(16_384),
});

/** Sandbox limits. */
export type SandboxLimits = z.infer<typeof SandboxLimitsSchema>;

/** Everything the launcher needs to run one container. The worker writes it, the launcher reads it. */
export const SandboxJobSpecSchema = z.strictObject({
  argv: z.array(z.string().max(100_000)).min(1).max(64),
  env: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(10_000)),
  working_dir: z.string().startsWith('/').max(500),
  mounts: z.array(SandboxMountSchema).max(8),
  limits: SandboxLimitsSchema,
  /** `proxy` joins the sandbox network with the proxy as its exit; `none` has no network. */
  network: z.enum(['proxy', 'none']),
});

/** A sandbox job spec. */
export type SandboxJobSpec = z.infer<typeof SandboxJobSpecSchema>;

/** One container run: its spec, its state and its output, capped. */
export const SandboxJobSchema = z.strictObject({
  id: IdSchema,
  run_id: IdSchema.nullable(),
  agent_id: IdSchema.nullable(),
  kind: SandboxJobKindSchema,
  status: SandboxJobStatusSchema,
  spec: SandboxJobSpecSchema,
  exit_code: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  error: z.string().nullable(),
  created_at: DateTimeSchema,
  started_at: DateTimeSchema.nullable(),
  finished_at: DateTimeSchema.nullable(),
});

/** A sandbox job as the API returns it. */
export type SandboxJob = z.infer<typeof SandboxJobSchema>;

/** Query of `GET /sandbox_jobs`. */
export const SandboxJobListQuerySchema = z.strictObject({
  run_id: IdSchema.optional(),
  agent_id: IdSchema.optional(),
  status: SandboxJobStatusSchema.optional(),
});

/** Query of `GET /sandbox_jobs`. */
export type SandboxJobListQuery = z.infer<typeof SandboxJobListQuerySchema>;
