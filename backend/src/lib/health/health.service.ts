import { Inject, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { HealthCheckStatus, HealthResponse, ProcessType } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';
import { PrismaService } from '@/lib/database/prisma.service';
import { with_timeout } from '@/utils/with_timeout';

/** How long the database has to answer a health probe. */
const DATABASE_CHECK_TIMEOUT_MS = 2_000;

/** Injection token for a process's own checks, besides the database. */
export const EXTRA_HEALTH_CHECKS = Symbol('EXTRA_HEALTH_CHECKS');

/** A process's own checks, keyed by name. */
export type ExtraHealthChecks = () => Promise<Record<string, HealthCheckStatus>>;

/**
 * Reports whether this process and the services it depends on are usable. The database check runs
 * where the database is wired in, and a process adds checks of its own by providing
 * `EXTRA_HEALTH_CHECKS` in its root module.
 */
@Injectable()
export class HealthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
    private readonly module_ref: ModuleRef,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /** Runs every check. The overall status is `ok` only when every check is `ok`. */
  async check(): Promise<HealthResponse> {
    const checks: Record<string, HealthCheckStatus> = {};
    if (this.prisma !== undefined) checks['database'] = await this.check_database(this.prisma);
    const extra = this.extra_checks();
    if (extra !== undefined) Object.assign(checks, await extra());
    const status = Object.values(checks).every((item) => item === 'ok') ? 'ok' : 'unavailable';
    return {
      status,
      process_type: this.process_type,
      commit_sha: this.config.git_commit_sha,
      checks,
    };
  }

  /** The root module's own checks, when it provides them. */
  private extra_checks(): ExtraHealthChecks | undefined {
    try {
      return this.module_ref.get<ExtraHealthChecks>(EXTRA_HEALTH_CHECKS, { strict: false });
    } catch {
      return undefined;
    }
  }

  private async check_database(prisma: PrismaService): Promise<HealthCheckStatus> {
    try {
      await with_timeout(prisma.$queryRaw`SELECT 1`, DATABASE_CHECK_TIMEOUT_MS);
      return 'ok';
    } catch {
      return 'unavailable';
    }
  }
}
