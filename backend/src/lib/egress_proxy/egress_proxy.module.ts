import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule } from '@/config/app_config.module';
import type { AppConfig } from '@/config/config.schema';
import { EXTRA_HEALTH_CHECKS, type ExtraHealthChecks } from '@/lib/health/health.service';
import { LoggingModule } from '@/lib/logging/logging.module';
import { MetricsModule } from '@/lib/metrics/metrics.module';
import { OpsServerModule } from '@/lib/ops_server/ops_server.module';
import { EGRESS_DIALER, system_dialer } from './egress_dialer';
import { EgressProxyService } from './egress_proxy.service';

/**
 * Root module of the `egress_proxy` process. It has no database and no domain module: only the
 * proxy, its logs, its metrics and its ops port.
 */
@Module({})
export class EgressProxyModule {
  /**
   * Builds the proxy root module for one parsed configuration.
   *
   * @param config - Configuration parsed at bootstrap.
   */
  static register(config: AppConfig): DynamicModule {
    return {
      module: EgressProxyModule,
      imports: [
        AppConfigModule.register({ config, process_type: 'egress_proxy' }),
        LoggingModule,
        MetricsModule,
        OpsServerModule,
      ],
      providers: [
        { provide: EGRESS_DIALER, useFactory: system_dialer },
        EgressProxyService,
        {
          provide: EXTRA_HEALTH_CHECKS,
          inject: [EgressProxyService],
          useFactory:
            (proxy: EgressProxyService): ExtraHealthChecks =>
            () =>
              proxy.health_checks(),
        },
      ],
    };
  }
}
