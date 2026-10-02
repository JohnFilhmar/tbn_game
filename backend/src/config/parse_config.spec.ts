import { ops_port, require_database_url, require_secrets_key } from './config.schema';
import { ConfigError, parse_config } from './parse_config';

const TEST_KEY = Buffer.alloc(32, 2).toString('base64');

const minimal_env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://tbn@localhost:5432/tbn',
  SECRETS_ENCRYPTION_KEY: TEST_KEY,
};

function problems_of(env: Record<string, string>): string[] {
  try {
    parse_config(env);
  } catch (error: unknown) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error('Expected parse_config to reject the environment');
}

describe('parse_config', () => {
  it('applies defaults to a minimal environment', () => {
    expect(parse_config(minimal_env)).toEqual({
      node_env: 'test',
      log_level: 'info',
      git_commit_sha: 'unknown',
      shutdown_timeout_ms: 25_000,
      secrets_encryption_key: TEST_KEY,
      database: { url: 'postgresql://tbn@localhost:5432/tbn', pool_max: 10 },
      web: { port: 3000, cors_origins: [], body_limit_bytes: 1_048_576, client_dir: undefined },
      worker: { port: 3001, concurrency: 4, run_lease_seconds: 120 },
      auth: { session_ttl_minutes: 720 },
      workspace: { dir: '/workspace' },
      providers: {
        timeout_ms: 300_000,
        max_attempts: 4,
        breaker_threshold: 3,
        breaker_cooldown_seconds: 60,
      },
      sandbox: {
        port: 3002,
        docker_socket: '/var/run/docker.sock',
        image: 'tbn/sandbox:development',
        network: 'tbn_development_sandbox',
        workspace_volume: 'tbn_development_workspace',
        max_parallel: 2,
        uid: 65_532,
        max_cpus: 2,
        max_memory_mb: 2_048,
        max_scratch_mb: 1_024,
        output_max_bytes: 65_536,
      },
      egress: {
        port: 3128,
        ops_port: 3003,
        url: 'http://egress_proxy:3128',
        allowed_hosts: [],
        max_response_bytes: 10_485_760,
        max_requests_per_minute: 120,
        max_connections: 256,
      },
      fetch: { max_bytes: 2_097_152 },
      integrations: { timeout_ms: 15_000 },
      search: { searxng_url: undefined },
      retention: { event_days: 0, command_hours: 0 },
    });
  });

  it('parses explicit values and ignores unrelated variables', () => {
    const config = parse_config({
      ...minimal_env,
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      WEB_PORT: '8080',
      WORKER_PORT: '8081',
      DATABASE_URL: 'postgres://tbn@postgres:5432/tbn',
      DATABASE_POOL_MAX: '4',
      CORS_ORIGINS: ' https://tbn.example.ts.net , tauri://localhost ,',
      HTTP_BODY_LIMIT_BYTES: '2048',
      CLIENT_DIR: '/app/client',
      SHUTDOWN_TIMEOUT_MS: '5000',
      GIT_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
      SESSION_TTL_MINUTES: '60',
      WORKER_CONCURRENCY: '2',
      WORKSPACE_DIR: '/srv/workspace',
      PROVIDER_TIMEOUT_MS: '5000',
      PROVIDER_MAX_ATTEMPTS: '2',
      RUN_LEASE_SECONDS: '45',
      PROVIDER_BREAKER_THRESHOLD: '5',
      PROVIDER_BREAKER_COOLDOWN_SECONDS: '30',
      SANDBOX_PORT: '3012',
      DOCKER_SOCKET: '/run/docker.sock',
      SANDBOX_IMAGE: 'ghcr.io/example/sandbox@sha256:abc',
      SANDBOX_NETWORK: 'tbn_sandbox',
      WORKSPACE_VOLUME: '/srv/workspace',
      SANDBOX_MAX_PARALLEL: '3',
      SANDBOX_MAX_CPUS: '1.5',
      SANDBOX_MAX_MEMORY_MB: '512',
      SANDBOX_MAX_SCRATCH_MB: '256',
      SANDBOX_OUTPUT_MAX_BYTES: '4096',
      EGRESS_PROXY_PORT: '8128',
      EGRESS_PROXY_OPS_PORT: '3013',
      EGRESS_PROXY_URL: 'http://proxy:8128',
      EGRESS_ALLOWED_HOSTS: 'example.com, npmjs.org',
      EGRESS_MAX_RESPONSE_BYTES: '1048576',
      EGRESS_MAX_REQUESTS_PER_MINUTE: '10',
      EGRESS_MAX_CONNECTIONS: '8',
      FETCH_MAX_BYTES: '65536',
      INTEGRATION_TIMEOUT_MS: '2000',
      SEARXNG_URL: 'http://searxng:8080',
      EVENT_RETENTION_DAYS: '7',
      COMMAND_RETENTION_HOURS: '2',
      PATH: '/usr/bin',
    });
    expect(config).toEqual({
      node_env: 'production',
      log_level: 'warn',
      git_commit_sha: '0123456789abcdef0123456789abcdef01234567',
      shutdown_timeout_ms: 5_000,
      secrets_encryption_key: TEST_KEY,
      database: { url: 'postgres://tbn@postgres:5432/tbn', pool_max: 4 },
      web: {
        port: 8080,
        cors_origins: ['https://tbn.example.ts.net', 'tauri://localhost'],
        body_limit_bytes: 2_048,
        client_dir: '/app/client',
      },
      worker: { port: 8081, concurrency: 2, run_lease_seconds: 45 },
      auth: { session_ttl_minutes: 60 },
      workspace: { dir: '/srv/workspace' },
      providers: {
        timeout_ms: 5_000,
        max_attempts: 2,
        breaker_threshold: 5,
        breaker_cooldown_seconds: 30,
      },
      sandbox: {
        port: 3012,
        docker_socket: '/run/docker.sock',
        image: 'ghcr.io/example/sandbox@sha256:abc',
        network: 'tbn_sandbox',
        workspace_volume: '/srv/workspace',
        max_parallel: 3,
        uid: 65_532,
        max_cpus: 1.5,
        max_memory_mb: 512,
        max_scratch_mb: 256,
        output_max_bytes: 4_096,
      },
      egress: {
        port: 8128,
        ops_port: 3013,
        url: 'http://proxy:8128',
        allowed_hosts: ['example.com', 'npmjs.org'],
        max_response_bytes: 1_048_576,
        max_requests_per_minute: 10,
        max_connections: 8,
      },
      fetch: { max_bytes: 65_536 },
      integrations: { timeout_ms: 2_000 },
      search: { searxng_url: 'http://searxng:8080' },
      retention: { event_days: 7, command_hours: 2 },
    });
  });

  it('leaves the database URL and the key to the process, and rejects a short key', () => {
    const proxy = parse_config({ NODE_ENV: 'test' });
    expect(proxy.database.url).toBeUndefined();
    expect(proxy.secrets_encryption_key).toBeUndefined();
    expect(() => require_database_url(proxy)).toThrow('DATABASE_URL is required');
    expect(() => require_secrets_key(proxy)).toThrow('SECRETS_ENCRYPTION_KEY is required');
    expect(ops_port(proxy, 'web')).toBe(3000);
    expect(ops_port(proxy, 'sandbox')).toBe(3002);
    expect(ops_port(proxy, 'egress_proxy')).toBe(3003);
    expect(problems_of({ ...minimal_env, SECRETS_ENCRYPTION_KEY: 'c2hvcnQ=' })).toEqual([
      expect.stringMatching(/^SECRETS_ENCRYPTION_KEY: /),
    ]);
  });

  it('rejects a database URL that is not PostgreSQL', () => {
    expect(problems_of({ ...minimal_env, DATABASE_URL: 'mysql://tbn@localhost/tbn' })).toEqual([
      expect.stringMatching(/^DATABASE_URL: /),
    ]);
  });

  it('rejects an out of range port and an unknown NODE_ENV', () => {
    expect(problems_of({ ...minimal_env, NODE_ENV: 'staging', WEB_PORT: '70000' })).toEqual([
      expect.stringMatching(/^NODE_ENV: /),
      expect.stringMatching(/^WEB_PORT: /),
    ]);
  });

  it('never echoes a value in the error', () => {
    const secret = 'hunter2-should-not-appear';
    const problems = problems_of({ ...minimal_env, DATABASE_URL: `not a url ${secret}` });
    expect(problems.join('\n')).not.toContain(secret);
  });
});
