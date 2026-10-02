import { mkdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SandboxJobSpecSchema,
  type SandboxJob,
  type SandboxJobKind,
  type SandboxJobListQuery,
  type SandboxJobSpec,
  type SandboxLimits,
  type SandboxMount,
} from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { QueueService } from '@/lib/queue/queue.service';
import type { AgentRecord } from '@/modules/company/types/company_records';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import {
  SANDBOX_JOB_REPOSITORY,
  type SandboxJobRepository,
} from '@/modules/runtime/repositories/interface/sandbox_job_repository.interface';
import type { SandboxJobRecord } from '@/modules/runtime/types/sandbox_job_record';

/** Where an agent's checkouts live on the workspace volume, relative to its root. */
export function checkouts_subpath(owner_id: string, agent_id: string): string {
  return posix.join('checkouts', owner_id, agent_id);
}

/** Where the owner's shared files live on the workspace volume, relative to its root. */
export function files_subpath(owner_id: string): string {
  return posix.join('owners', owner_id);
}

/** Where a canonical bare repository lives on the workspace volume, relative to its root. */
export function repo_subpath(owner_id: string, repository_name: string): string {
  return posix.join('repos', owner_id, `${repository_name}.git`);
}

/** The worker keeps waiting this long past a job's own limit before it gives the job up. */
const WAIT_GRACE_MS = 30_000;
const POLL_MS = 1_000;
const PIDS_LIMIT = 512;

/** Raised when a job's working directory leaves the checkout. */
export class SandboxPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxPathError';
  }
}

/** The run a job belongs to, for the proxy identity and the row. */
export interface JobOrigin {
  run_id: string;
  agent: AgentRecord;
}

/** What `run_system` runs: an operation of the fixed git script, with its mounts. */
export interface SystemJobRequest {
  owner_id: string;
  argv: string[];
  env?: Record<string, string>;
  mounts: SandboxMount[];
  network: 'proxy' | 'none';
  origin?: JobOrigin;
}

/** Maps a job row to the API shape. A spec that no longer parses is shown as the launcher saw it. */
export function to_sandbox_job_view(record: SandboxJobRecord): SandboxJob {
  const spec = SandboxJobSpecSchema.safeParse(record.spec);
  return {
    id: record.id,
    run_id: record.run_id,
    agent_id: record.agent_id,
    kind: record.kind,
    status: record.status,
    spec: spec.success
      ? spec.data
      : {
          argv: [],
          env: {},
          working_dir: '/',
          mounts: [],
          limits: { cpus: 0.1, memory_mb: 64, scratch_mb: 16, timeout_seconds: 1, pids: 16 },
          network: 'none',
        },
    exit_code: record.exit_code,
    stdout: record.stdout,
    stderr: record.stderr,
    error: record.error,
    created_at: record.created_at.toISOString(),
    started_at: record.started_at?.toISOString() ?? null,
    finished_at: record.finished_at?.toISOString() ?? null,
  };
}

/**
 * The worker's side of sandbox jobs: it writes a job's spec, hands it to the launcher through the
 * queue, and waits for the outcome. An agent's job runs in its own checkout with the proxy as its
 * exit; a system job runs the fixed git script on a canonical repository.
 */
@Injectable()
export class SandboxJobService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SANDBOX_JOB_REPOSITORY) private readonly jobs: SandboxJobRepository,
    private readonly queue: QueueService,
    private readonly preferences: PreferenceService,
  ) {}

  /** Jobs of the owner, newest first. */
  async list(owner_id: string, query: SandboxJobListQuery): Promise<SandboxJob[]> {
    return (await this.jobs.list(owner_id, query)).map(to_sandbox_job_view);
  }

  /** One job. */
  async get(owner_id: string, id: string): Promise<SandboxJob> {
    const record = await this.jobs.find(owner_id, id);
    if (record === null) throw new NotFoundException('Sandbox job not found');
    return to_sandbox_job_view(record);
  }

  /**
   * Runs a shell command for an agent in its checkout directory, with the owner's shared files
   * read-only at `/files`, the owner's limits, and the proxy as the only way out.
   *
   * @param origin - The run and agent the command belongs to.
   * @param command - The bash command line.
   * @param cwd - A directory inside the checkout, relative to it.
   */
  async run_for_agent(origin: JobOrigin, command: string, cwd = '.'): Promise<SandboxJobRecord> {
    const { agent } = origin;
    const limits = await this.limits_for(agent.owner_id);
    const checkouts = checkouts_subpath(agent.owner_id, agent.id);
    const files = files_subpath(agent.owner_id);
    await mkdir(join(this.config.workspace.dir, checkouts), { recursive: true });
    await mkdir(join(this.config.workspace.dir, files), { recursive: true });
    const spec: SandboxJobSpec = {
      argv: ['bash', '-lc', command],
      env: this.agent_env(origin),
      working_dir: working_dir_of(cwd),
      mounts: [
        { subpath: checkouts, target: '/work', read_only: false },
        { subpath: files, target: '/files', read_only: true },
      ],
      limits,
      network: 'proxy',
    };
    return this.run(agent.owner_id, 'agent', spec, origin);
  }

  /** Runs a system job: the fixed git script, or any other fixed command, on the mounts given. */
  async run_system(request: SystemJobRequest): Promise<SandboxJobRecord> {
    const limits = await this.limits_for(request.owner_id);
    const spec: SandboxJobSpec = {
      argv: request.argv,
      env: {
        ...this.base_env(),
        ...(request.origin !== undefined && this.proxy_env(request.origin)),
        ...request.env,
      },
      working_dir: '/tmp',
      mounts: request.mounts,
      limits,
      network: request.network,
    };
    return this.run(request.owner_id, 'system', spec, request.origin);
  }

  private async run(
    owner_id: string,
    kind: SandboxJobKind,
    spec: SandboxJobSpec,
    origin: JobOrigin | undefined,
  ): Promise<SandboxJobRecord> {
    const created = await this.jobs.create(owner_id, {
      run_id: origin?.run_id ?? null,
      agent_id: origin?.agent.id ?? null,
      kind,
      spec,
    });
    await this.queue.send_sandbox_job({ owner_id, job_id: created.id });
    return this.wait(owner_id, created.id, spec.limits.timeout_seconds * 1_000 + WAIT_GRACE_MS);
  }

  /** Polls the row until the launcher reports, or marks the job lost after `timeout_ms`. */
  private async wait(owner_id: string, id: string, timeout_ms: number): Promise<SandboxJobRecord> {
    const deadline = Date.now() + timeout_ms;
    for (;;) {
      const record = await this.jobs.find(owner_id, id);
      if (record === null) throw new NotFoundException('Sandbox job disappeared');
      if (record.status !== 'queued' && record.status !== 'running') return record;
      if (Date.now() >= deadline) {
        const lost = await this.jobs.mark_lost(
          owner_id,
          id,
          'The sandbox launcher did not report in time. Is it running?',
        );
        return lost ?? record;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  private async limits_for(owner_id: string): Promise<SandboxLimits> {
    const preferences = await this.preferences.get(owner_id);
    return {
      cpus: preferences.sandbox_cpus,
      memory_mb: preferences.sandbox_memory_mb,
      scratch_mb: preferences.sandbox_scratch_mb,
      timeout_seconds: preferences.sandbox_timeout_seconds,
      pids: PIDS_LIMIT,
    };
  }

  private agent_env(origin: JobOrigin): Record<string, string> {
    return {
      ...this.base_env(),
      ...this.proxy_env(origin),
      TBN_AGENT: origin.agent.name,
    };
  }

  private base_env(): Record<string, string> {
    return {
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      HOME: '/home/agent',
      TMPDIR: '/tmp',
      LANG: 'C.UTF-8',
      CI: 'true',
      GIT_TERMINAL_PROMPT: '0',
    };
  }

  /** The proxy with the run's identity, in every spelling the usual tools read. */
  private proxy_env(origin: JobOrigin): Record<string, string> {
    const url = new URL(this.config.egress.url);
    url.username = origin.run_id;
    url.password = origin.agent.id;
    const proxy = url.toString();
    return {
      HTTP_PROXY: proxy,
      HTTPS_PROXY: proxy,
      ALL_PROXY: proxy,
      http_proxy: proxy,
      https_proxy: proxy,
      all_proxy: proxy,
      NO_PROXY: '',
      no_proxy: '',
    };
  }
}

/** `/work` plus a relative directory that stays inside it. */
export function working_dir_of(cwd: string): string {
  const resolved = posix.normalize(posix.join('/work', cwd));
  if (resolved !== '/work' && !resolved.startsWith('/work/')) {
    throw new SandboxPathError('cwd must stay inside the checkout directory');
  }
  return resolved;
}
