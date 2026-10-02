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
      this.logger.error(`Queue error: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /** True once shutdown began. Long handlers check it between steps and return early. */
  get stopping(): boolean {
    return this.is_stopping;
  }

  /** Connects and makes sure the queues exist. */
  async onApplicationBootstrap(): Promise<void> {
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

  /** Stops fetching, waits for active handlers to return, then closes the pool. */
  async beforeApplicationShutdown(): Promise<void> {
    this.is_stopping = true;
    await this.boss.stop({
      graceful: true,
      close: true,
      timeout: Math.max(1_000, this.config.shutdown_timeout_ms - STOP_MARGIN_MS),
    });
  }

  /**
   * Asks the worker to look at an agent. Wakes for the same agent collapse into one while it is
   * still queued, so sending often is cheap.
   *
   * @param job - The agent to wake.
   * @param delay_seconds - Optional delay before the wake becomes available.
   */
  async send_agent_wake(job: AgentWakeJob, delay_seconds = 0): Promise<void> {
    await this.boss.send(AGENT_WAKE_QUEUE, job, {
      singletonKey: job.agent_id,
      startAfter: delay_seconds,
    });
  }

  /**
   * Registers the worker's handler for `agent_wake` jobs, `WORKER_CONCURRENCY` at a time.
   *
   * @param handler - Called once per job. A throw fails the job, which pg-boss retries.
   */
  async work_agent_wake(handler: (job: AgentWakeJob) => Promise<void>): Promise<void> {
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
