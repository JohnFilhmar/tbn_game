import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule } from '@/config/app_config.module';
import type { AppConfig } from '@/config/config.schema';
import { DatabaseModule } from '@/lib/database/database.module';
import { LoggingModule } from '@/lib/logging/logging.module';
import { IdentityModule } from '@/modules/identity/identity.module';
import { RuntimeProvidersModule } from '@/modules/runtime/runtime_providers.module';

/** Root module of one-off admin commands. It loads only what the commands need. */
@Module({})
export class AdminModule {
  /**
   * Builds the admin root module for one parsed configuration.
   *
   * @param config - Configuration parsed at bootstrap.
   */
  static register(config: AppConfig): DynamicModule {
    return {
      module: AdminModule,
      imports: [
        AppConfigModule.register({ config, process_type: 'web' }),
        LoggingModule,
        DatabaseModule,
        IdentityModule,
        RuntimeProvidersModule,
      ],
    };
  }
}
