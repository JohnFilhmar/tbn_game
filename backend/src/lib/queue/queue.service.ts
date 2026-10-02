import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { ProcessType } from '@tbn/contracts';
import { PgBoss } from 'pg-boss';
import { require_database_url, type AppConfig } from '@/config/config.schema';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';
import {
  AGENT_WAKE_QUEUE,
  NOTIFY_QUEUE,
  SANDBOX_JOB_QUEUE,
  type AgentWakeJob,
  type NotifyJob,
  type SandboxJobJob,
} from './queues';

const QUEUE_SCHEMA = 'pgboss';

/**
 * Seconds before a worker fetches again when nothing is waiting. LISTEN/NOTIFY wakes it sooner for
 * a new job, but a delayed wake (a cap window reset, a breaker cooldown) sends no NOTIFY when it
 * comes due, so the worker keeps this interval with NOTIFY on instead of pg-boss's 30 s default.
 */
const POLLING_INTERVAL_SECONDS = 2;

/** How long one wake may stay active before pg-boss hands it to another worker. */
const WAKE_EXPIRE_SECONDS = 6 * 60 * 60;

/** How long one sandbox job may stay active; the launcher's own time limit is far shorter. */
const SANDBOX_JOB_EXPIRE_SECONDS = 24 * 60 * 60;

/** Connections pg-boss keeps on top of Prisma's pool. */
const QUEUE_POOL_MAX = 4;

/** Headroom the queue leaves to the rest of the shutdown. */
const STOP_MARGIN_MS = 3_000;

/** How long the worker waits between attempts to reach the queue. */
const START_RETRY_MS = 5_000;

function error_message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The pg-boss job queue, the only queue in the system. The web process only sends; the worker
 * handles wakes and notifications, and the sandbox launcher handles sandbox jobs. The schema comes
 * from a Prisma migration, so pg-boss never migrates on boot.
 *
 * Ceiling: pg-boss holds its own small pool and, on a handling process, one LISTEN connection.
 * Each process therefore uses `DATABASE_POOL_MAX` plus `QUEUE_POOL_MAX` plus one connections.
 */
@Injectable()
export class QueueService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(QueueService.name);
  private readonly boss: PgBoss;
  private is_stopping = false;
  private starting: Promise<void> | undefined;
  private cancel_retry_wait: (() => void) | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
  ) {
    const handles_jobs = process_type === 'worker' || process_type === 'sandbox';
    this.boss = new PgBoss({
      connectionString: require_database_url(config),
      application_name: `tbn_${process_type}_queue`,
      schema: QUEUE_SCHEMA,
      max: QUEUE_POOL_MAX,
      migrate: false,
      createSchema: false,
      supervise: process_type === 'worker',
      schedule: false,
      useListenNotify: handles_jobs,
    });
    this.boss.on('error', (error: unknown) => {
      this.logger.error(`Queue error: ${error_message(error)}`);
    });
  }

  /** True once shutdown began. Long handlers check it between steps and return early. */
  get stopping(): boolean {
    return this.is_stopping;
  }

  /**
   * The worker connects at boot and keeps trying until the queue schema exists, so a fresh stack
   * comes up healthy before the migration release step runs. Nothing awaits the attempt here, so
   * the health listener still starts. The web process connects on its first send, so it can come
   * up and report the database as unavailable instead of crashing.
   */
  onApplicationBootstrap(): void {
    if (this.process_type !== 'worker' && this.process_type !== 'sandbox') return;
    this.starting = this.start_until_ready();
    this.starting.catch(() => undefined);
  }

  /** Stops fetching, waits for active handlers to return, then closes the pool. */
  async beforeApplicationShutdown(): Promise<void> {
    this.is_stopping = true;
    this.cancel_retry_wait?.();
    if (this.starting === undefined) return;
    await this.starting.catch(() => undefined);
    try {
      await this.boss.stop({
        graceful: true,
        close: true,
        timeout: Math.max(1_000, this.config.shutdown_timeout_ms - STOP_MARGIN_MS),
      });
    } catch (error: unknown) {
      this.logger.warn(`Queue did not stop cleanly: ${error_message(error)}`);
    }
  }

  private ensure_started(): Promise<void> {
    this.starting ??= this.start().catch((error: unknown) => {
      this.starting = undefined;
      throw error;
    });
    return this.starting;
  }

  /** Retries `start` until it succeeds or shutdown begins. Attempts reuse the pool once it is open. */
  private async start_until_ready(): Promise<void> {
    let attempts = 0;
    for (;;) {
      try {
        await this.start();
        if (attempts > 0) this.logger.log('Queue is ready');
        return;
      } catch (error: unknown) {
        if (this.is_stopping) throw error;
        attempts += 1;
        this.logger.warn(
          `Queue is not ready: ${error_message(error)}. Retrying in ${START_RETRY_MS / 1_000} s. ` +
            'A fresh database needs the migration release step first.',
        );
        await this.wait_before_retry();
        if (this.is_stopping) throw error;
      }
    }
  }

  private wait_before_retry(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.cancel_retry_wait = undefined;
        resolve();
      }, START_RETRY_MS);
      this.cancel_retry_wait = () => {
        clearTimeout(timer);
        this.cancel_retry_wait = undefined;
        resolve();
      };
    });
  }

  private async start(): Promise<void> {
    await this.boss.start();
    if ((await this.boss.getQueue(AGENT_WAKE_QUEUE)) === null) {
      await this.boss.createQueue(AGENT_WAKE_QUEUE, {
        policy: 'standard',
        expireInSeconds: WAKE_EXPIRE_SECONDS,
        retryLimit: 3,
        retryDelay: 5,
        retryBackoff: true,
        notify: true,
      });
    }
    if ((await this.boss.getQueue(SANDBOX_JOB_QUEUE)) === null) {
      // A shell command is never run twice on its own: the worker reports a lost job instead.
      await this.boss.createQueue(SANDBOX_JOB_QUEUE, {
        policy: 'standard',
        expireInSeconds: SANDBOX_JOB_EXPIRE_SECONDS,
        retryLimit: 0,
        notify: true,
      });
    }
    if ((await this.boss.getQueue(NOTIFY_QUEUE)) === null) {
      await this.boss.createQueue(NOTIFY_QUEUE, {
        policy: 'standard',
        expireInSeconds: WAKE_EXPIRE_SECONDS,
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
        notify: true,
      });
    }
  }

  /**
   * Asks the worker to look at an agent. A wake due now is skipped while another one for the same
   * agent is queued and due, because that one will see the change; wakes never pile up behind a
   * busy worker. A delayed wake is always sent. The agent is the wake's group, so a worker handles
   * one wake per agent at a time.
   *
   * @param job - The agent to wake.
   * @param delay_seconds - Optional delay before the wake becomes available.
   */
  async send_agent_wake(job: AgentWakeJob, delay_seconds = 0): Promise<void> {
    await this.ensure_started();
    if (delay_seconds === 0 && (await this.has_due_wake(job.agent_id))) return;
    await this.boss.send(AGENT_WAKE_QUEUE, job, {
      startAfter: delay_seconds,
      group: { id: job.agent_id },
    });
  }

  /** True when a wake for the agent is queued and due. */
  private async has_due_wake(agent_id: string): Promise<boolean> {
    const queued = await this.boss.findJobs(AGENT_WAKE_QUEUE, {
      data: { agent_id },
      queued: true,
    });
    const now = Date.now();
    return queued.some((job) => job.startAfter.getTime() <= now);
  }

  /**
   * Registers the worker's handler for `agent_wake` jobs, `WORKER_CONCURRENCY` at a time and one
   * per agent at a time, so two wakes of one agent never race in this process. On the worker this
   * resolves once the queue is reachable, which may be after the release step.
   *
   * Ceiling: the one-per-agent limit is held in this process. With several worker processes two
   * wakes of one agent can run at once; the run lease still keeps either from driving the other's
   * run.
   *
   * @param handler - Called once per job. A throw fails the job, which pg-boss retries.
   */
  async work_agent_wake(handler: (job: AgentWakeJob) => Promise<void>): Promise<void> {
    await this.ensure_started();
    await this.boss.work<AgentWakeJob>(
      AGENT_WAKE_QUEUE,
      {
        localConcurrency: this.config.worker.concurrency,
        localGroupConcurrency: 1,
        pollingIntervalSeconds: POLLING_INTERVAL_SECONDS,
        notifyPollingIntervalSeconds: POLLING_INTERVAL_SECONDS,
      },
      async ([job]) => {
        if (job !== undefined) await handler(job.data);
      },
    );
  }

  /** Hands a sandbox job to the launcher. The spec is in the `sandbox_jobs` row. */
  async send_sandbox_job(job: SandboxJobJob): Promise<void> {
    await this.ensure_started();
    await this.boss.send(SANDBOX_JOB_QUEUE, job);
  }

  /**
   * Registers the launcher's handler for sandbox jobs, `concurrency` at a time, which is the cap
   * on parallel sandbox containers.
   */
  async work_sandbox_jobs(
    handler: (job: SandboxJobJob) => Promise<void>,
    concurrency: number,
  ): Promise<void> {
    await this.ensure_started();
    await this.boss.work<SandboxJobJob>(
      SANDBOX_JOB_QUEUE,
      {
        localConcurrency: concurrency,
        pollingIntervalSeconds: POLLING_INTERVAL_SECONDS,
        notifyPollingIntervalSeconds: POLLING_INTERVAL_SECONDS,
      },
      async ([job]) => {
        if (job !== undefined) await handler(job.data);
      },
    );
  }

  /** Asks the worker to send a notification. A throw retries it later. */
  async send_notify(job: NotifyJob): Promise<void> {
    await this.ensure_started();
    await this.boss.send(NOTIFY_QUEUE, job);
  }

  /** Registers the worker's handler for notifications. */
  async work_notify(handler: (job: NotifyJob) => Promise<void>): Promise<void> {
    await this.ensure_started();
    await this.boss.work<NotifyJob>(
      NOTIFY_QUEUE,
      {
        localConcurrency: 2,
        pollingIntervalSeconds: POLLING_INTERVAL_SECONDS,
        notifyPollingIntervalSeconds: POLLING_INTERVAL_SECONDS,
      },
      async ([job]) => {
        if (job !== undefined) await handler(job.data);
      },
    );
  }
}
