import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule } from '@/config/app_config.module';
import type { AppConfig } from '@/config/config.schema';
import { DatabaseModule } from '@/lib/database/database.module';
import { HealthModule } from '@/lib/health/health.module';
import { LoggingModule } from '@/lib/logging/logging.module';
import { MetricsModule } from '@/lib/metrics/metrics.module';
import { DOMAIN_MODULES } from '@/modules/domain_modules';

/** Root module of the `web` process: HTTP routes, and the WebSocket gateway from phase 2. */
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
        ...DOMAIN_MODULES,
      ],
    };
  }
}
