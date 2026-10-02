import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ProcessType } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';
import { CommandStore } from '@/lib/idempotency/command_store';
import {
  EVENT_REPOSITORY,
  type EventRepository,
} from '@/modules/events/repositories/interface/event_repository.interface';
import { error_message } from '@/utils/error_details';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The first prune waits this long after boot, for the migration release step to finish. */
const FIRST_PRUNE_MS = 60_000;

/** What one prune removed. */
export interface PruneResult {
  events: number;
  commands: number;
}

/**
 * Keeps the event log and the command store from growing without end: on the worker, once an hour,
 * it removes events older than `EVENT_RETENTION_DAYS` and commands older than
 * `COMMAND_RETENTION_HOURS`. A client whose cursor falls before the oldest event left resyncs, and
 * a command id older than its retention can run again.
 *
 * Ceiling: every worker process prunes every owner. With several workers the deletes overlap,
 * which is safe.
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    private readonly commands: CommandStore,
  ) {}

  onApplicationBootstrap(): void {
    if (this.process_type === 'worker') this.schedule(FIRST_PRUNE_MS);
  }

  onApplicationShutdown(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /**
   * Prunes once. Each store logs and swallows its own failure, and the next hour tries again.
   *
   * @param now - The time retention counts back from.
   */
  async prune(now = new Date()): Promise<PruneResult> {
    const result: PruneResult = { events: 0, commands: 0 };
    try {
      result.events = await this.events.prune(
        new Date(now.getTime() - this.config.retention.event_days * DAY_MS),
      );
    } catch (error: unknown) {
      this.logger.warn(`Events not pruned: ${error_message(error)}`);
    }
    try {
      result.commands = await this.commands.prune(
        new Date(now.getTime() - this.config.retention.command_hours * HOUR_MS),
      );
    } catch (error: unknown) {
      this.logger.warn(`Commands not pruned: ${error_message(error)}`);
    }
    if (result.events + result.commands > 0) {
      this.logger.log(`Pruned ${result.events} events and ${result.commands} commands`);
    }
    return result;
  }

  private schedule(delay_ms: number): void {
    this.timer = setTimeout(() => {
      void this.prune().finally(() => {
        if (this.timer !== undefined) this.schedule(HOUR_MS);
      });
    }, delay_ms);
    this.timer.unref();
  }
}
