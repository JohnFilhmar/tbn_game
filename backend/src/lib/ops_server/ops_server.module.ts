import { Module } from '@nestjs/common';
import { HealthModule } from '@/lib/health/health.module';
import { MetricsModule } from '@/lib/metrics/metrics.module';
import { OpsServerService } from './ops_server.service';

/** Health and metrics over plain HTTP for the worker process. */
@Module({
  imports: [HealthModule, MetricsModule],
  providers: [OpsServerService],
  exports: [OpsServerService],
})
export class OpsServerModule {}
