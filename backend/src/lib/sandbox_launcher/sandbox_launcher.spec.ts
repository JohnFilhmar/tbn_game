import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { SandboxJobSpec } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { PrismaService } from '@/lib/database/prisma.service';
import type { DockerEngineClient } from '@/lib/docker_engine/docker_engine_client';
import { OpsServerService } from '@/lib/ops_server/ops_server.service';
import { QueueService } from '@/lib/queue/queue.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import {
  launcher_test_config,
  prepare_test_sandbox,
  start_test_launcher,
} from '@/testing/test_launcher';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { reset_worker_state } from '@/testing/test_worker';
import { wait_for } from '@/testing/wait_for';
import { SANDBOX_LABEL, build_container_request } from './container_request';

/** The job rows as the launcher leaves them. */
interface JobRow {
  status: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
  started_at: Date | null;
  finished_at: Date | null;
}

const MB = 1_048_576;

describe('the sandbox launcher', () => {
  let config: AppConfig;
  let app: NestExpressApplication;
  let launcher: INestApplicationContext;
  let prisma: PrismaService;
  let queue: QueueService;
  let docker: DockerEngineClient;
  let owner: TestOwner;
  let orphan: { container_id: string; job_id: string };
  let checkout: string;
  let base: SandboxJobSpec;

  beforeAll(async () => {
    config = launcher_test_config(load_test_config());
    app = await create_test_web_app(config);
    await reset_worker_state(app);
    prisma = app.get(PrismaService);
    queue = app.get(QueueService);
    owner = await create_test_owner(app);
    docker = await prepare_test_sandbox(config);

    const checkouts = `checkouts/${owner.owner_id}/launcher_test`;
    const files = `owners/${owner.owner_id}`;
    checkout = join(config.workspace.dir, checkouts);
    await mkdir(checkout, { recursive: true });
    await mkdir(join(config.workspace.dir, files), { recursive: true });
    await writeFile(join(config.workspace.dir, files, 'note.txt'), 'a shared note\n');
    base = {
      argv: ['bash', '-lc', 'true'],
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/agent' },
      working_dir: '/work',
      mounts: [
        { subpath: checkouts, target: '/work', read_only: false },
        { subpath: files, target: '/files', read_only: true },
      ],
      limits: { cpus: 1, memory_mb: 256, scratch_mb: 64, timeout_seconds: 30, pids: 64 },
      network: 'proxy',
    };

    // What a crashed launcher leaves behind: a labelled container and a job marked running.
    const row = await prisma.sandboxJob.create({
      data: { owner_id: owner.owner_id, kind: 'system', status: 'running', spec: base },
    });
    const request = build_container_request(
      { ...base, argv: ['sleep', '300'], limits: { ...base.limits, timeout_seconds: 300 } },
      config,
      { 'com.tbn.sandbox_job': row.id },
    );
    const container_id = await docker.create_container(
      `tbn_sandbox_orphan_${randomBytes(4).toString('hex')}`,
      request,
    );
    await docker.start_container(container_id);
    orphan = { container_id, job_id: row.id };

    launcher = await start_test_launcher(config);
  }, 300_000);

  afterAll(async () => {
    await launcher.close();
    await app.close();
  });

  /** Queues a job for the launcher and waits for its outcome. */
  async function run_job(overrides: Partial<SandboxJobSpec>): Promise<JobRow & { id: string }> {
    const row = await prisma.sandboxJob.create({
      data: { owner_id: owner.owner_id, kind: 'system', spec: { ...base, ...overrides } },
    });
    await queue.send_sandbox_job({ owner_id: owner.owner_id, job_id: row.id });
    return wait_for(
      `sandbox job ${row.id} to finish`,
      async () => {
        const found = await prisma.sandboxJob.findUniqueOrThrow({ where: { id: row.id } });
        return found.status === 'queued' || found.status === 'running' ? undefined : found;
      },
      { timeout_ms: 50_000, interval_ms: 250 },
    );
  }

  it('reports the engine, the image and the network on its ops port', async () => {
    const port = launcher.get(OpsServerService).port;
    const health: unknown = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    expect(health).toMatchObject({
      status: 'ok',
      process_type: 'sandbox',
      checks: { database: 'ok', docker: 'ok', sandbox_image: 'ok', sandbox_network: 'ok' },
    });
  });

  it('removes the containers a crash left behind and marks their jobs lost', async () => {
    await wait_for('the orphaned container to be removed', async () => {
      const found = await docker.containers_with_label(`${SANDBOX_LABEL}=1`);
      return found.some((container) => container.id === orphan.container_id) ? undefined : true;
    });
    const row = await prisma.sandboxJob.findUniqueOrThrow({ where: { id: orphan.job_id } });
    expect(row.status).toBe('lost');
    expect(row.error).toContain('restart');
  });

  it('runs a job as the sandbox user on its mounts, with the limits applied', async () => {
    const script = [
      'echo hello',
      'cat /files/note.txt',
      'echo made > /work/made.txt',
      'id -u',
      'cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes',
      'cat /sys/fs/cgroup/pids.max 2>/dev/null || cat /sys/fs/cgroup/pids/pids.max',
      'echo to_stderr >&2',
    ].join('; ');
    const job = await run_job({ argv: ['bash', '-lc', script] });
    expect(job).toMatchObject({ status: 'done', exit_code: 0, error: null });
    expect(job.stdout.split('\n')).toEqual([
      'hello',
      'a shared note',
      String(config.sandbox.uid),
      String(256 * MB),
      '64',
      '',
    ]);
    expect(job.stderr).toBe('to_stderr\n');
    expect(await readFile(join(checkout, 'made.txt'), 'utf8')).toBe('made\n');
    expect(job.started_at).not.toBeNull();
    expect(job.finished_at).not.toBeNull();
  });

  it('writes only to the checkout and the scratch space', async () => {
    const script = [
      'touch /files/x 2>/dev/null && echo files_writable',
      'touch /usr/x 2>/dev/null && echo root_writable',
      'touch /tmp/ok /home/agent/ok && echo scratch_ok',
      'cd /work/sub 2>/dev/null || mkdir /work/sub && echo checkout_ok',
    ].join('; ');
    const job = await run_job({ argv: ['bash', '-lc', script] });
    expect(job.status).toBe('done');
    expect(job.stdout).toBe('scratch_ok\ncheckout_ok\n');
  });

  it('reports a failing command with its exit code', async () => {
    const job = await run_job({ argv: ['bash', '-lc', 'echo nope >&2; exit 3'] });
    expect(job).toMatchObject({ status: 'failed', exit_code: 3, stderr: 'nope\n' });
  });

  it('kills a job at its time limit', async () => {
    const started = Date.now();
    const job = await run_job({
      argv: ['bash', '-lc', 'echo starting; sleep 60; echo never'],
      limits: { ...base.limits, timeout_seconds: 2 },
    });
    expect(job).toMatchObject({ status: 'timed_out', exit_code: null });
    expect(job.error).toBe('Timed out after 2 s');
    expect(job.stdout).toBe('starting\n');
    expect(Date.now() - started).toBeLessThan(20_000);
  });

  it('caps the output and keeps both ends', async () => {
    const job = await run_job({
      argv: ['bash', '-lc', 'echo START; head -c 300000 /dev/zero | tr "\\0" a; echo; echo END'],
    });
    expect(job.status).toBe('done');
    expect(job.stdout.length).toBeLessThan(config.sandbox.output_max_bytes + 100);
    expect(job.stdout.startsWith('START\n')).toBe(true);
    expect(job.stdout.endsWith('END\n')).toBe(true);
    expect(job.stdout).toContain('bytes dropped');
  });

  it('runs jobs in parallel, at most the configured number at a time', async () => {
    const jobs = await Promise.all(
      [1, 2, 3].map(() => run_job({ argv: ['bash', '-lc', 'sleep 2'] })),
    );
    const spans = jobs
      .map((job) => ({
        start: job.started_at?.getTime() ?? Number.NaN,
        end: job.finished_at?.getTime() ?? Number.NaN,
      }))
      .sort((a, b) => a.start - b.start);
    const overlapping = (at: number): number =>
      spans.filter((span) => span.start <= at && at < span.end).length;
    const most = Math.max(...spans.map((span) => overlapping(span.start)));
    expect(most).toBe(2);
  });

  it('cannot reach the host or the internet', async () => {
    const server: Server = createServer((_request, response) => response.end('host'));
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const bound = server.address();
    if (bound === null || typeof bound === 'string') throw new Error('No port bound');
    const port = bound.port;
    const addresses = Object.values(networkInterfaces())
      .flat()
      .flatMap((address) => (address?.family === 'IPv4' ? [address.address] : []));
    expect(addresses.length).toBeGreaterThan(0);
    try {
      // curl prints the status it got, or 000 when it could not connect.
      const status_format = '%{http_code}';
      const probes = addresses.map(
        (address) =>
          `curl -s -m 2 -o /dev/null -w "${address}=${status_format}\\n" "http://${address}:${port}/"`,
      );
      probes.push(
        `curl -s -m 3 -o /dev/null -w "internet=${status_format}\\n" https://example.com/`,
      );
      const job = await run_job({ argv: ['bash', '-lc', probes.join('; ')] });
      const lines = job.stdout.trim().split('\n');
      expect(lines).toHaveLength(addresses.length + 1);
      for (const line of lines) expect(line.endsWith('=000')).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('runs with no network at all when asked', async () => {
    const job = await run_job({
      argv: ['bash', '-lc', 'ip -o link 2>/dev/null || cat /sys/class/net/*/address | wc -l'],
      network: 'none',
    });
    expect(job.status).toBe('done');
    expect(job.stdout).not.toContain('eth0');
  });

  it('fails a job whose spec the launcher refuses', async () => {
    const job = await run_job({
      mounts: [{ subpath: '../outside', target: '/work', read_only: false }],
    });
    expect(job.status).toBe('failed');
    expect(job.error).toContain('leaves the workspace');
  });
});
