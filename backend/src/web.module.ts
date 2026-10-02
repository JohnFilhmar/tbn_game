import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule } from '@/config/app_config.module';
import type { AppConfig } from '@/config/config.schema';
import { DatabaseModule } from '@/lib/database/database.module';
import { HealthModule } from '@/lib/health/health.module';
import { EXTRA_HEALTH_CHECKS, type ExtraHealthChecks } from '@/lib/health/health.service';
import { LoggingModule } from '@/lib/logging/logging.module';
import { MetricsModule } from '@/lib/metrics/metrics.module';
import { PgListenerService } from '@/lib/realtime/pg_listener.service';
import { RealtimeModule } from '@/lib/realtime/realtime.module';
import { DOMAIN_MODULES } from '@/modules/domain_modules';

/** Root module of the `web` process: HTTP routes and the Socket.IO gateway. */
@Module({})
export class WebModule {
  /**
   * Builds the web root module for one parsed configuration.
   *
   * @param config - Configuration parsed at bootstrap.
   */
  static register(config: AppConfig): DynamicModule {
    return {
      module: WebModule,
      imports: [
        AppConfigModule.register({ config, process_type: 'web' }),
        LoggingModule,
        DatabaseModule,
        HealthModule,
        MetricsModule,
        RealtimeModule,
        ...DOMAIN_MODULES,
      ],
      providers: [
        {
          provide: EXTRA_HEALTH_CHECKS,
          inject: [PgListenerService],
          useFactory:
            (listener: PgListenerService): ExtraHealthChecks =>
            () =>
              Promise.resolve({ event_listener: listener.is_connected ? 'ok' : 'unavailable' }),
        },
      ],
    };
  }
}
