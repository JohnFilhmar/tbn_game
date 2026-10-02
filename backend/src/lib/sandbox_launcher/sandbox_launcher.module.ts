import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule } from '@/config/app_config.module';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { DatabaseModule } from '@/lib/database/database.module';
import { DockerEngineClient } from '@/lib/docker_engine/docker_engine_client';
import { EXTRA_HEALTH_CHECKS, type ExtraHealthChecks } from '@/lib/health/health.service';
import { LoggingModule } from '@/lib/logging/logging.module';
import { OpsServerModule } from '@/lib/ops_server/ops_server.module';
import { QueueModule } from '@/lib/queue/queue.module';
import { SandboxJobStore } from './sandbox_job_store';
import { DOCKER_ENGINE, SandboxLauncherService } from './sandbox_launcher.service';

/**
 * Root module of the `sandbox` process, the launcher. It needs the database for the queue and
 * the job rows, the docker socket, and its ops port. No domain module is loaded: it knows jobs,
 * not agents.
 */
@Module({})
export class SandboxLauncherModule {
  /**
   * Builds the launcher root module for one parsed configuration.
   *
   * @param config - Configuration parsed at bootstrap.
   */
  static register(config: AppConfig): DynamicModule {
    return {
      module: SandboxLauncherModule,
      imports: [
        AppConfigModule.register({ config, process_type: 'sandbox' }),
        LoggingModule,
        DatabaseModule,
        QueueModule,
        OpsServerModule,
      ],
      providers: [
        {
          provide: DOCKER_ENGINE,
          inject: [APP_CONFIG],
          useFactory: (app_config: AppConfig) =>
            new DockerEngineClient(app_config.sandbox.docker_socket),
        },
        SandboxJobStore,
        SandboxLauncherService,
        {
          provide: EXTRA_HEALTH_CHECKS,
          inject: [SandboxLauncherService],
          useFactory:
            (launcher: SandboxLauncherService): ExtraHealthChecks =>
            () =>
              launcher.health_checks(),
        },
      ],
    };
  }
}
