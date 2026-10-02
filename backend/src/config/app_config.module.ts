import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { ProcessType } from '@tbn/contracts';
import type { AppConfig } from './config.schema';
import { APP_CONFIG, ONE_OFF, PROCESS_TYPE } from './config.tokens';

/** Options for `AppConfigModule.register`. */
export interface AppConfigModuleOptions {
  /** Configuration parsed at bootstrap. */
  config: AppConfig;
  /** Which process this application runs as. */
  process_type: ProcessType;
  /** True for a one-off command, such as `admin.js`, rather than a long-running process. */
  one_off?: boolean;
}

/** Makes the configuration and the process type injectable everywhere. */
@Global()
@Module({})
export class AppConfigModule {
  /**
   * Registers the configuration for one process.
   *
   * @param options - The parsed configuration and the process type.
   */
  static register(options: AppConfigModuleOptions): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [
        { provide: APP_CONFIG, useValue: options.config },
        { provide: PROCESS_TYPE, useValue: options.process_type },
        { provide: ONE_OFF, useValue: options.one_off ?? false },
      ],
      exports: [APP_CONFIG, PROCESS_TYPE, ONE_OFF],
    };
  }
}
