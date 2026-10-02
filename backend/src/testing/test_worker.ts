import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AppConfig } from '@/config/config.schema';
import { PrismaService } from '@/lib/database/prisma.service';
import { WorkerModule } from '@/worker.module';
import { wait_for } from './wait_for';

/**
 * Starts the worker in this process, the way `worker.ts` does but without a port. It handles
 * `agent_wake` jobs until closed.
 */
export async function start_test_worker(config: AppConfig): Promise<INestApplicationContext> {
  const module_ref = await Test.createTestingModule({
    imports: [WorkerModule.register({ ...config, worker: { ...config.worker, port: 0 } })],
  }).compile();
  return module_ref.init();
}

/**
 * Deletes every queued wake, so wakes left behind by earlier test files do not reach the worker
 * a test starts.
 */
export async function clear_queued_wakes(app: INestApplicationContext): Promise<void> {
  await app.get(PrismaService)
    .$executeRaw`DELETE FROM pgboss.job WHERE name = 'agent_wake' AND state IN ('created', 'retry')`;
}

/** A worker running as a separate OS process from `dist/worker.js`. */
export interface WorkerProcess {
  child: ChildProcess;
  port: number;
  /** Sends the signal and waits for the process to exit. Returns the exit code or signal. */
  stop(signal: NodeJS.Signals): Promise<number | NodeJS.Signals | null>;
}

/**
 * Spawns the built worker with the test environment plus `env`. Returns once its health endpoint
 * answers. `npm test` builds `dist/` first; run `nest build` by hand before a single spec.
 */
export async function start_worker_process(env: Record<string, string>): Promise<WorkerProcess> {
  const port = 30_000 + Math.floor(Math.random() * 20_000);
  const child = spawn(process.execPath, [join(process.cwd(), 'dist/worker.js')], {
    env: { ...process.env, LOG_LEVEL: 'warn', ...env, WORKER_PORT: String(port) },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await wait_for(
    `worker process on port ${port}`,
    async () => {
      if (child.exitCode !== null) throw new Error(`worker exited with ${child.exitCode}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        return response.ok ? true : undefined;
      } catch {
        return undefined;
      }
    },
    { timeout_ms: 30_000, interval_ms: 250 },
  );
  return {
    child,
    port,
    stop: (signal) =>
      new Promise((resolve) => {
        if (child.exitCode !== null) {
          resolve(child.exitCode);
          return;
        }
        child.once('exit', (code, exit_signal) => resolve(code ?? exit_signal));
        child.kill(signal);
      }),
  };
}
