import { Inject, Injectable } from '@nestjs/common';
import type { HealthCheckStatus, HealthResponse, ProcessType } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';
import { PrismaService } from '@/lib/database/prisma.service';
import { with_timeout } from '@/utils/with_timeout';

/** How long the database has to answer a health probe. */
const DATABASE_CHECK_TIMEOUT_MS = 2_000;

/** Reports whether this process and the services it depends on are usable. */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
  ) {}

  /** Runs every check. The overall status is `ok` only when every check is `ok`. */
  async check(): Promise<HealthResponse> {
    const database = await this.check_database();
    return {
      status: database,
      process_type: this.process_type,
      commit_sha: this.config.git_commit_sha,
      checks: { database },
    };
  }

  private async check_database(): Promise<HealthCheckStatus> {
    try {
      await with_timeout(this.prisma.$queryRaw`SELECT 1`, DATABASE_CHECK_TIMEOUT_MS);
      return 'ok';
    } catch {
      return 'unavailable';
    }
  }
}
