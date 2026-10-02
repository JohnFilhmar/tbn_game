import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKEND = join(ROOT, 'backend');

/** Where the e2e backend listens. */
export const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 4310);
const WORKER_PORT = Number(process.env['E2E_WORKER_PORT'] ?? 4311);

/**
 * The one owner of the e2e database, made by the first run and kept by later ones.
 * Development-only credentials for a disposable database.
 */
export const OWNER = { username: 'e2e_owner', password: 'e2e-correct-horse-battery' };

/** Tells this run's rows from those an earlier run left in a kept database. */
export const RUN_ID = process.env['E2E_RUN_ID'] ?? Date.now().toString(36);

/** The address of the desktop the flows open. */
export const APP_URL = `http://127.0.0.1:${WEB_PORT}/app/`;

/** The disposable database of the e2e run; it must not be the stack's own. */
export function e2eDatabaseUrl(): string {
  const url = process.env['E2E_DATABASE_URL'];
  if (url === undefined || url.length === 0) {
    throw new Error('Set E2E_DATABASE_URL to a disposable database, such as .../tbn_e2e');
  }
  if (/\/tbn(\?|$)/.test(url)) throw new Error('E2E_DATABASE_URL must not be the stack database');
  return url;
}

function backendEnv(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: process.env['E2E_LOG_LEVEL'] ?? 'warn',
    DATABASE_URL: databaseUrl,
    SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    WEB_PORT: String(WEB_PORT),
    WORKER_PORT: String(WORKER_PORT),
    CLIENT_DIR: join(ROOT, 'client', 'dist'),
    WORKSPACE_DIR: join(ROOT, '.workspace_e2e'),
    PROVIDER_TIMEOUT_MS: '15000',
    PROVIDER_MAX_ATTEMPTS: '2',
    RUN_LEASE_SECONDS: '30',
  };
}

function runOnce(command: string, args: string[], env: NodeJS.ProcessEnv, input = ''): string {
  const result = spawnSync(command, args, { cwd: BACKEND, env, input, encoding: 'utf8' });
  const output = `${result.stderr}${result.stdout}`;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${output}`);
  return output;
}

function createOwner(env: NodeJS.ProcessEnv): void {
  try {
    runOnce(
      process.execPath,
      [join(BACKEND, 'dist', 'admin.js'), 'owner_create', OWNER.username],
      env,
      OWNER.password,
    );
  } catch (error: unknown) {
    if (!(error instanceof Error && error.message.includes('An owner already exists'))) throw error;
  }
}

async function waitForHealth(name: string, port: number, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${name} exited with ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${name} did not become healthy on port ${port}`);
}

function startProcess(entry: string): ChildProcess {
  return spawn(process.execPath, [join(BACKEND, 'dist', entry)], {
    cwd: BACKEND,
    env: backendEnv(e2eDatabaseUrl()),
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

/** The backend of the e2e run: a web process serving the built client, and a worker. */
export interface E2eStack {
  stop: () => Promise<void>;
}

/**
 * Applies the migrations to the e2e database, creates the owner unless an earlier run did, and
 * starts the built web process and worker. `npm run build` builds the backend and the client first.
 */
export async function startStack(): Promise<E2eStack> {
  const env = backendEnv(e2eDatabaseUrl());
  mkdirSync(join(ROOT, '.workspace_e2e'), { recursive: true });
  runOnce('npx', ['prisma', 'migrate', 'deploy'], env);
  createOwner(env);
  const web = startProcess('web.js');
  const worker = startProcess('worker.js');
  await Promise.all([
    waitForHealth('web', WEB_PORT, web),
    waitForHealth('worker', WORKER_PORT, worker),
  ]);
  const stopOne = (child: ChildProcess): Promise<void> =>
    new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });
  return { stop: async () => void (await Promise.all([stopOne(web), stopOne(worker)])) };
}
