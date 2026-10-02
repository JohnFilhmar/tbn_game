import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { HealthCheckStatus } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { DockerEngineClient } from '@/lib/docker_engine/docker_engine_client';
import { QueueService } from '@/lib/queue/queue.service';
import type { SandboxJobJob } from '@/lib/queue/queues';
import { SANDBOX_LABEL, build_container_request, cap_output } from './container_request';
import { SandboxJobStore, type ClaimedJob } from './sandbox_job_store';

/** Injection token for the Docker Engine client. */
export const DOCKER_ENGINE = Symbol('DOCKER_ENGINE');

/** How long a killed container has to stop before its job is reported anyway. */
const KILL_GRACE_MS = 10_000;

function error_message(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/**
 * The sandbox launcher: the one process holding the docker socket. It takes sandbox jobs from
 * the queue, runs each in a fresh hardened container from the sandbox image, enforces the job's
 * time limit, caps its output and writes the outcome back. It listens on nothing but its ops
 * port, so the only way to give it work is a row in the database.
 */
@Injectable()
export class SandboxLauncherService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(SandboxLauncherService.name);
  private readonly running = new Map<string, string>();
  private stopping = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DOCKER_ENGINE) private readonly docker: DockerEngineClient,
    private readonly store: SandboxJobStore,
    private readonly queue: QueueService,
  ) {}

  /** Removes what a crash left behind, then starts taking jobs. */
  onApplicationBootstrap(): void {
    this.begin().catch((error: unknown) => {
      if (this.queue.stopping) return;
      this.logger.error(`Launcher cannot take jobs: ${error_message(error)}`);
    });
  }

  /** Kills the containers of jobs still running; their rows are marked lost at the next boot. */
  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    for (const [job_id, container_id] of this.running) {
      this.logger.warn(`Stopping with job ${job_id} still running, killing its container`);
      await this.docker.kill_container(container_id).catch(() => undefined);
    }
  }

  /**
   * The launcher's own health: the engine answers, the sandbox image exists, and the sandbox
   * network exists and is internal.
   */
  async health_checks(): Promise<Record<string, HealthCheckStatus>> {
    const docker = await this.docker.ping();
    let image: HealthCheckStatus = 'unavailable';
    let network: HealthCheckStatus = 'unavailable';
    if (docker) {
      const { sandbox } = this.config;
      image = (await this.docker.has_image(sandbox.image).catch(() => false))
        ? 'ok'
        : 'unavailable';
      const found = await this.docker.inspect_network(sandbox.network).catch(() => null);
      network = found?.internal === true ? 'ok' : 'unavailable';
    }
    return {
      docker: docker ? 'ok' : 'unavailable',
      sandbox_image: image,
      sandbox_network: network,
    };
  }

  /** Runs one job from the queue. Never throws: the row carries the outcome. */
  async handle(job: SandboxJobJob): Promise<void> {
    const claimed = await this.store.claim(job.job_id);
    if (claimed === null) return;
    try {
      await this.run(claimed);
    } catch (error: unknown) {
      this.logger.error(`Sandbox job ${claimed.id} failed: ${error_message(error)}`);
      await this.store.finish(claimed.id, {
        status: 'failed',
        exit_code: null,
        stdout: '',
        stderr: '',
        error: error_message(error),
      });
    }
  }

  private async begin(): Promise<void> {
    await this.reap_orphans();
    await this.queue.work_sandbox_jobs((job) => this.handle(job), this.config.sandbox.max_parallel);
    this.logger.log(
      `Sandbox launcher ready: ${this.config.sandbox.max_parallel} containers at a time from ${this.config.sandbox.image}`,
    );
  }

  /** Removes every container of a previous launcher and marks the jobs that ran in them lost. */
  private async reap_orphans(): Promise<void> {
    const containers = await this.docker.containers_with_label(`${SANDBOX_LABEL}=1`);
    for (const container of containers) {
      this.logger.warn(`Removing orphaned sandbox container ${container.name}`);
      await this.docker.remove_container(container.id);
    }
    const lost = await this.store.mark_running_lost();
    if (lost > 0) this.logger.warn(`Marked ${lost} sandbox jobs lost after a restart`);
  }

  private async run(job: ClaimedJob): Promise<void> {
    const request = build_container_request(job.spec, this.config, {
      'com.tbn.sandbox_job': job.id,
      'com.tbn.owner': job.owner_id,
    });
    const container_id = await this.docker.create_container(`tbn_sandbox_${job.id}`, request);
    this.running.set(job.id, container_id);
    try {
      await this.docker.start_container(container_id);
      const exit_code = await this.wait_with_limit(container_id, job.spec.limits.timeout_seconds);
      const timed_out = exit_code === null;
      const logs = await this.docker.container_logs(container_id);
      const max = this.config.sandbox.output_max_bytes;
      await this.store.finish(job.id, {
        status: timed_out ? 'timed_out' : exit_code === 0 ? 'done' : 'failed',
        exit_code,
        stdout: cap_output(logs.stdout, max),
        stderr: cap_output(logs.stderr, max),
        error: timed_out ? `Timed out after ${job.spec.limits.timeout_seconds} s` : null,
      });
      this.logger.log(
        `Sandbox job ${job.id} ${timed_out ? 'timed out' : `exited ${exit_code}`}${this.stopping ? ' during shutdown' : ''}`,
      );
    } finally {
      this.running.delete(job.id);
      await this.docker.remove_container(container_id).catch((error: unknown) => {
        this.logger.warn(`Could not remove container ${container_id}: ${error_message(error)}`);
      });
    }
  }

  /** The exit code, or null when the limit passed first and the container was killed. */
  private async wait_with_limit(
    container_id: string,
    timeout_seconds: number,
  ): Promise<number | null> {
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeout_seconds * 1_000);
    });
    try {
      const outcome = await Promise.race([this.docker.wait_container(container_id), limit]);
      if (outcome !== null) return outcome;
      await this.docker.kill_container(container_id);
      await Promise.race([
        this.docker.wait_container(container_id),
        new Promise((resolve) => setTimeout(resolve, KILL_GRACE_MS)),
      ]);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
