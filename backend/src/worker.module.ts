import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule } from '@/config/app_config.module';
import type { AppConfig } from '@/config/config.schema';
import { DatabaseModule } from '@/lib/database/database.module';
import { LoggingModule } from '@/lib/logging/logging.module';
import { OpsServerModule } from '@/lib/ops_server/ops_server.module';
import { DOMAIN_MODULES } from '@/modules/domain_modules';

/**
 * Root module of the `worker` process, which runs agent work from phase 1a. It runs as an
 * application context, so controllers in the imported modules are never mounted here.
 */
@Module({})
export class WorkerModule {
  /**
   * Builds the worker root module for one parsed configuration.
   *
   * @param config - Configuration parsed at bootstrap.
   */
  static register(config: AppConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        AppConfigModule.register({ config, process_type: 'worker' }),
        LoggingModule,
        DatabaseModule,
        OpsServerModule,
        ...DOMAIN_MODULES,
      ],
    };
  }
}
