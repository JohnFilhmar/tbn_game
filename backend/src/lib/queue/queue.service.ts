import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { ProcessType } from '@tbn/contracts';
import { PgBoss } from 'pg-boss';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';
import { AGENT_WAKE_QUEUE, type AgentWakeJob } from './queues';

const QUEUE_SCHEMA = 'pgboss';

/** Seconds before a worker fetches again when nothing is waiting. LISTEN/NOTIFY wakes it sooner. */
const POLLING_INTERVAL_SECONDS = 2;

/** How long one wake may stay active before pg-boss hands it to another worker. */
const WAKE_EXPIRE_SECONDS = 6 * 60 * 60;

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
 * also handles. The schema comes from a Prisma migration, so pg-boss never migrates on boot.
 *
 * Ceiling: pg-boss holds its own small pool and, on the worker, one LISTEN connection. Each process
 * therefore uses `DATABASE_POOL_MAX` plus `QUEUE_POOL_MAX` plus one connections.
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
    const is_worker = process_type === 'worker';
    this.boss = new PgBoss({
      connectionString: config.database.url,
      application_name: `tbn_${process_type}_queue`,
      schema: QUEUE_SCHEMA,
      max: QUEUE_POOL_MAX,
      migrate: false,
      createSchema: false,
      supervise: is_worker,
      schedule: false,
      useListenNotify: is_worker,
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
    if (this.process_type !== 'worker') return;
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
  }

  /**
   * Asks the worker to look at an agent. Duplicate wakes are cheap: the handler is idempotent and
   * returns at once for an agent with nothing to do.
   *
   * @param job - The agent to wake.
   * @param delay_seconds - Optional delay before the wake becomes available.
   */
  async send_agent_wake(job: AgentWakeJob, delay_seconds = 0): Promise<void> {
    await this.ensure_started();
    await this.boss.send(AGENT_WAKE_QUEUE, job, { startAfter: delay_seconds });
  }

  /**
   * Registers the worker's handler for `agent_wake` jobs, `WORKER_CONCURRENCY` at a time. On the
   * worker this resolves once the queue is reachable, which may be after the release step.
   *
   * @param handler - Called once per job. A throw fails the job, which pg-boss retries.
   */
  async work_agent_wake(handler: (job: AgentWakeJob) => Promise<void>): Promise<void> {
    await this.ensure_started();
    await this.boss.work<AgentWakeJob>(
      AGENT_WAKE_QUEUE,
      {
        localConcurrency: this.config.worker.concurrency,
        pollingIntervalSeconds: POLLING_INTERVAL_SECONDS,
      },
      async ([job]) => {
        if (job !== undefined) await handler(job.data);
      },
    );
  }
}
