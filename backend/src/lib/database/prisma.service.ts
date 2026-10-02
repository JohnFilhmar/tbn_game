import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { require_database_url, type AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { PrismaClient } from '@/generated/prisma/client';

/** How long opening a new database connection may take before the attempt fails. */
const DATABASE_CONNECT_TIMEOUT_MS = 5_000;

/**
 * The Prisma client for the one PostgreSQL database.
 *
 * Ceiling: one PostgreSQL server holds all state. Every web and worker process opens up to
 * `DATABASE_POOL_MAX` connections, so processes times pool size must stay below the server's
 * `max_connections` (100 by default).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: require_database_url(config),
        max: config.database.pool_max,
        connectionTimeoutMillis: DATABASE_CONNECT_TIMEOUT_MS,
      }),
    });
  }

  /**
   * Closes the connection pool in the last shutdown phase, after the queue has drained its active
   * handlers, so a run in flight can still write its checkpoint.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
