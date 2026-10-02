import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';

/** The pg-boss job queue. */
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
