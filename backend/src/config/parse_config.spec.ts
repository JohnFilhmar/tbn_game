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
      web: { port: 3000, cors_origins: [], body_limit_bytes: 1_048_576 },
      worker: { port: 3001, concurrency: 4, run_lease_seconds: 120 },
      auth: { session_ttl_minutes: 720 },
      workspace: { dir: '/workspace' },
      providers: { timeout_ms: 300_000, max_attempts: 4 },
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
      SHUTDOWN_TIMEOUT_MS: '5000',
      GIT_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
      SESSION_TTL_MINUTES: '60',
      WORKER_CONCURRENCY: '2',
      WORKSPACE_DIR: '/srv/workspace',
      PROVIDER_TIMEOUT_MS: '5000',
      PROVIDER_MAX_ATTEMPTS: '2',
      RUN_LEASE_SECONDS: '45',
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
      },
      worker: { port: 8081, concurrency: 2, run_lease_seconds: 45 },
      auth: { session_ttl_minutes: 60 },
      workspace: { dir: '/srv/workspace' },
      providers: { timeout_ms: 5_000, max_attempts: 2 },
    });
  });

  it('rejects a missing DATABASE_URL and a missing or short encryption key', () => {
    expect(problems_of({ NODE_ENV: 'test', SECRETS_ENCRYPTION_KEY: TEST_KEY })).toEqual([
      expect.stringMatching(/^DATABASE_URL: /),
    ]);
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
