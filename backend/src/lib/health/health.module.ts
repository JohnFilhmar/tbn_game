import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * Health checks. The controller is mounted only where the process serves Nest HTTP routes. The
 * database check runs where the root module imports `DatabaseModule`.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
