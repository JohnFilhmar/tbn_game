import { z } from 'zod';

const port_schema = z.coerce.number().int().min(0).max(65_535);

const comma_list_schema = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0),
);

const env_schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WEB_PORT: port_schema.default(3000),
  WORKER_PORT: port_schema.default(3001),
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  CORS_ORIGINS: comma_list_schema.pipe(z.array(z.url())).default([]),
  HTTP_BODY_LIMIT_BYTES: z.coerce.number().int().min(1_024).max(52_428_800).default(1_048_576),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(25_000),
  GIT_COMMIT_SHA: z
    .string()
    .regex(/^(?:[0-9a-f]{7,40}|unknown)$/)
    .default('unknown'),
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
  database: {
    url: env.DATABASE_URL,
    pool_max: env.DATABASE_POOL_MAX,
  },
  web: {
    port: env.WEB_PORT,
    cors_origins: env.CORS_ORIGINS,
    body_limit_bytes: env.HTTP_BODY_LIMIT_BYTES,
  },
  worker: {
    port: env.WORKER_PORT,
  },
}));

/** Typed configuration, parsed once at bootstrap and injected with the `APP_CONFIG` token. */
export type AppConfig = z.infer<typeof config_schema>;
