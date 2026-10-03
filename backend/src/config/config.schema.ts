import type { ProcessType } from '@tbn/contracts';
import { z } from 'zod';

const port_schema = z.coerce.number().int().min(0).max(65_535);

const comma_list_schema = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0),
);

const base64_key_schema = z
  .string()
  .regex(
    /^[A-Za-z0-9+/]{43}=$/,
    'must be 32 bytes encoded as base64, for example openssl rand -base64 32',
  );

const env_schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WEB_PORT: port_schema.default(3000),
  WORKER_PORT: port_schema.default(3001),
  SANDBOX_PORT: port_schema.default(3002),
  EGRESS_PROXY_OPS_PORT: port_schema.default(3003),
  // The egress proxy holds neither: it never reaches the database and seals nothing. Every other
  // process fails at boot without them.
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }).optional(),
  SECRETS_ENCRYPTION_KEY: base64_key_schema.optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  CORS_ORIGINS: comma_list_schema.pipe(z.array(z.url())).default([]),
  HTTP_BODY_LIMIT_BYTES: z.coerce.number().int().min(1_024).max(52_428_800).default(1_048_576),
  // Where the built client is. The web process serves it under /app; unset serves none.
  CLIENT_DIR: z.string().min(1).optional(),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(25_000),
  GIT_COMMIT_SHA: z
    .string()
    .regex(/^(?:[0-9a-f]{7,40}|unknown)$/)
    .default('unknown'),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(5).max(43_200).default(720),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  WORKSPACE_DIR: z.string().min(1).default('/workspace'),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(1_800_000).default(300_000),
  PROVIDER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(4),
  RUN_LEASE_SECONDS: z.coerce.number().int().min(10).max(3_600).default(120),
  PROVIDER_BREAKER_THRESHOLD: z.coerce.number().int().min(1).max(100).default(3),
  PROVIDER_BREAKER_COOLDOWN_SECONDS: z.coerce.number().int().min(1).max(3_600).default(60),
  DOCKER_SOCKET: z.string().min(1).default('/var/run/docker.sock'),
  SANDBOX_IMAGE: z.string().min(1).default('tbn/sandbox:development'),
  SANDBOX_NETWORK: z.string().min(1).default('tbn_development_sandbox'),
  // A named volume, or an absolute host path when the workspace is a bind mount.
  WORKSPACE_VOLUME: z.string().min(1).default('tbn_development_workspace'),
  SANDBOX_MAX_PARALLEL: z.coerce.number().int().min(1).max(64).default(2),
  // The uid sandbox containers run as: the sandbox image's agent user, which is also the worker's
  // uid, so the files either writes on the workspace volume belong to one user. Tests set it to
  // their own uid.
  SANDBOX_UID: z.coerce.number().int().min(0).max(4_294_967_294).default(65_532),
  SANDBOX_MAX_CPUS: z.coerce.number().min(0.1).max(64).default(2),
  SANDBOX_MAX_MEMORY_MB: z.coerce.number().int().min(64).max(262_144).default(2_048),
  SANDBOX_MAX_SCRATCH_MB: z.coerce.number().int().min(16).max(65_536).default(1_024),
  SANDBOX_OUTPUT_MAX_BYTES: z.coerce.number().int().min(1_024).max(10_485_760).default(65_536),
  EGRESS_PROXY_PORT: port_schema.default(3128),
  EGRESS_PROXY_URL: z.url({ protocol: /^http$/ }).default('http://egress_proxy:3128'),
  EGRESS_ALLOWED_HOSTS: comma_list_schema.default([]),
  EGRESS_MAX_RESPONSE_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(1_073_741_824)
    .default(10_485_760),
  EGRESS_MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(120),
  EGRESS_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(10_000).default(256),
  FETCH_MAX_BYTES: z.coerce.number().int().min(1_024).max(104_857_600).default(2_097_152),
  INTEGRATION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(15_000),
  SEARXNG_URL: z.url({ protocol: /^https?$/ }).optional(),
  // 0 keeps every event and every command id, as the brief asks until the owner sets a limit.
  EVENT_RETENTION_DAYS: z.coerce.number().int().min(0).max(3_650).default(0),
  COMMAND_RETENTION_HOURS: z.coerce.number().int().min(0).max(8_760).default(0),
});

/**
 * Maps the environment variables to the typed configuration object. `.env.example` documents every
 * variable. Unknown variables are ignored.
 */
export const config_schema = env_schema.transform((env) => ({
  node_env: env.NODE_ENV,
  log_level: env.LOG_LEVEL,
  git_commit_sha: env.GIT_COMMIT_SHA,
  shutdown_timeout_ms: env.SHUTDOWN_TIMEOUT_MS,
  secrets_encryption_key: env.SECRETS_ENCRYPTION_KEY,
  database: {
    url: env.DATABASE_URL,
    pool_max: env.DATABASE_POOL_MAX,
  },
  web: {
    port: env.WEB_PORT,
    cors_origins: env.CORS_ORIGINS,
    body_limit_bytes: env.HTTP_BODY_LIMIT_BYTES,
    client_dir: env.CLIENT_DIR,
  },
  worker: {
    port: env.WORKER_PORT,
    concurrency: env.WORKER_CONCURRENCY,
    run_lease_seconds: env.RUN_LEASE_SECONDS,
  },
  auth: {
    session_ttl_minutes: env.SESSION_TTL_MINUTES,
  },
  workspace: {
    dir: env.WORKSPACE_DIR,
  },
  providers: {
    timeout_ms: env.PROVIDER_TIMEOUT_MS,
    max_attempts: env.PROVIDER_MAX_ATTEMPTS,
    breaker_threshold: env.PROVIDER_BREAKER_THRESHOLD,
    breaker_cooldown_seconds: env.PROVIDER_BREAKER_COOLDOWN_SECONDS,
  },
  sandbox: {
    port: env.SANDBOX_PORT,
    docker_socket: env.DOCKER_SOCKET,
    image: env.SANDBOX_IMAGE,
    network: env.SANDBOX_NETWORK,
    workspace_volume: env.WORKSPACE_VOLUME,
    max_parallel: env.SANDBOX_MAX_PARALLEL,
    uid: env.SANDBOX_UID,
    max_cpus: env.SANDBOX_MAX_CPUS,
    max_memory_mb: env.SANDBOX_MAX_MEMORY_MB,
    max_scratch_mb: env.SANDBOX_MAX_SCRATCH_MB,
    output_max_bytes: env.SANDBOX_OUTPUT_MAX_BYTES,
  },
  egress: {
    port: env.EGRESS_PROXY_PORT,
    ops_port: env.EGRESS_PROXY_OPS_PORT,
    url: env.EGRESS_PROXY_URL,
    allowed_hosts: env.EGRESS_ALLOWED_HOSTS,
    max_response_bytes: env.EGRESS_MAX_RESPONSE_BYTES,
    max_requests_per_minute: env.EGRESS_MAX_REQUESTS_PER_MINUTE,
    max_connections: env.EGRESS_MAX_CONNECTIONS,
  },
  fetch: {
    max_bytes: env.FETCH_MAX_BYTES,
  },
  integrations: {
    timeout_ms: env.INTEGRATION_TIMEOUT_MS,
  },
  search: {
    searxng_url: env.SEARXNG_URL,
  },
  retention: {
    event_days: env.EVENT_RETENTION_DAYS,
    command_hours: env.COMMAND_RETENTION_HOURS,
  },
}));

/** Typed configuration, parsed once at bootstrap and injected with the `APP_CONFIG` token. */
export type AppConfig = z.infer<typeof config_schema>;

/**
 * The port a process serves `/health` and `/metrics` on: the web process on its HTTP port, the
 * others on their own ops port.
 *
 * @param config - The parsed configuration.
 * @param process_type - The running process.
 */
export function ops_port(config: AppConfig, process_type: ProcessType): number {
  switch (process_type) {
    case 'web':
      return config.web.port;
    case 'worker':
      return config.worker.port;
    case 'sandbox':
      return config.sandbox.port;
    case 'egress_proxy':
      return config.egress.ops_port;
  }
}

/**
 * The database URL, which every process but the egress proxy needs.
 *
 * @throws Error when `DATABASE_URL` is not set.
 */
export function require_database_url(config: AppConfig): string {
  if (config.database.url === undefined) {
    throw new Error('DATABASE_URL is required for this process');
  }
  return config.database.url;
}

/**
 * The encryption key, which every process but the egress proxy needs.
 *
 * @throws Error when `SECRETS_ENCRYPTION_KEY` is not set.
 */
export function require_secrets_key(config: AppConfig): string {
  if (config.secrets_encryption_key === undefined) {
    throw new Error('SECRETS_ENCRYPTION_KEY is required for this process');
  }
  return config.secrets_encryption_key;
}
