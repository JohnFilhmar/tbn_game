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
 * Clears what earlier test files left for a worker or a launcher: queued wakes, sandbox jobs and
 * notifications, runs still running or paused, open tasks and undelivered subtask results. It
 * also dismisses their agents, because the sweep would otherwise wake them and keep a test's
 * worker busy calling fake providers that are gone, and disables their notification channels,
 * whose webhooks are gone too: a worker that boots after an unclean stop notifies every channel
 * for `process_restarted`, and the retries would queue ahead of the test's own notifications.
 * Test files run one at a time and each creates its own owner afterwards, so nothing of this
 * file's own is touched.
 */
export async function reset_worker_state(app: INestApplicationContext): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.$executeRaw`DELETE FROM pgboss.job WHERE name IN ('agent_wake', 'sandbox_job', 'notify') AND state IN ('created', 'retry')`;
  await prisma.notificationChannel.updateMany({
    where: { enabled: true },
    data: { enabled: false },
  });
  await prisma.run.updateMany({
    where: { status: { in: ['running', 'paused'] } },
    data: {
      status: 'cancelled',
      error: 'Left over by an earlier test file',
      finished_at: new Date(),
      pause_reason: null,
      resume_at: null,
      lease_owner: null,
      lease_expires_at: null,
    },
  });
  await prisma.task.updateMany({
    where: { status: { in: ['queued', 'in_progress', 'blocked', 'awaiting_approval'] } },
    data: { status: 'cancelled', finished_at: new Date() },
  });
  await prisma.task.updateMany({
    where: { delegator_agent_id: { not: null }, delegator_notified_at: null },
    data: { delegator_notified_at: new Date() },
  });
  await prisma.agent.updateMany({
    where: { active_run_id: { not: null } },
    data: { active_run_id: null },
  });
  await prisma.agent.updateMany({
    where: { status: { in: ['idle', 'working'] } },
    data: { status: 'dismissed' },
  });
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

/** What a one-off command printed and how it exited. */
export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs `dist/admin.js` with `args` in the test environment, the way the backup script and the
 * runbook run it, and waits for it to exit. `npm test` builds `dist/` first.
 */
export function run_admin_command(args: string[], stdin = ''): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), 'dist/admin.js'), ...args], {
      env: { ...process.env, LOG_LEVEL: 'warn' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}
