import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/lib/database/database.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/** Health checks. The controller is mounted only where the process serves Nest HTTP routes. */
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
