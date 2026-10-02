import { ConfigError, parse_config } from './parse_config';

const minimal_env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://tbn@localhost:5432/tbn',
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
      database: { url: 'postgresql://tbn@localhost:5432/tbn', pool_max: 10 },
      web: { port: 3000, cors_origins: [], body_limit_bytes: 1_048_576 },
      worker: { port: 3001 },
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
      PATH: '/usr/bin',
    });
    expect(config).toEqual({
      node_env: 'production',
      log_level: 'warn',
      git_commit_sha: '0123456789abcdef0123456789abcdef01234567',
      shutdown_timeout_ms: 5_000,
      database: { url: 'postgres://tbn@postgres:5432/tbn', pool_max: 4 },
      web: {
        port: 8080,
        cors_origins: ['https://tbn.example.ts.net', 'tauri://localhost'],
        body_limit_bytes: 2_048,
      },
      worker: { port: 8081 },
    });
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(problems_of({ NODE_ENV: 'test' })).toEqual([expect.stringMatching(/^DATABASE_URL: /)]);
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
