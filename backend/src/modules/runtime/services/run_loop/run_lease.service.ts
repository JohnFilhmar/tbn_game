import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import type { RunRecord } from '@/modules/runtime/types/run_record';

/**
 * This process's side of run leases: the id it holds them under, how long one lasts, and a
 * heartbeat that extends a lease while slow work runs.
 */
@Injectable()
export class RunLeaseService {
  private readonly logger = new Logger(RunLeaseService.name);

  /** Identifies this process in run leases. */
  readonly worker_id = `${hostname()}:${process.pid}:${randomBytes(3).toString('hex')}`;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
  ) {}

  /** When a lease taken or extended now ends. */
  until(): Date {
    return new Date(Date.now() + this.config.worker.run_lease_seconds * 1_000);
  }

  /**
   * Runs `work` while extending the lease, and reports whether the lease was lost meanwhile.
   *
   * @param run - A run this process holds the lease of.
   * @param work - The model call or tool calls to wait for.
   */
  async with_heartbeat<T>(
    run: RunRecord,
    work: () => Promise<T>,
  ): Promise<{ result: T; lost: boolean }> {
    let lost = false;
    const interval_ms = Math.max(1_000, (this.config.worker.run_lease_seconds * 1_000) / 3);
    const timer = setInterval(() => {
      this.runs
        .extend_lease(run.owner_id, run.id, this.worker_id, this.until())
        .then((held) => {
          if (!held) lost = true;
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Lease heartbeat failed: ${error instanceof Error ? error.message : 'unknown'}`,
          );
        });
    }, interval_ms);
    try {
      const result = await work();
      return { result, lost };
    } finally {
      clearInterval(timer);
    }
  }
}
