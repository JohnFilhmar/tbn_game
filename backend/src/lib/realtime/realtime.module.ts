import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/lib/database/database.module';
import { PgListenerService } from './pg_listener.service';
import { StreamPublisherService } from './stream_publisher.service';

/**
 * The two PostgreSQL channels between the processes: the web process listens for changes and
 * streamed output, and the worker publishes the stream. Both providers are safe in any process;
 * the listener connects only in `web`.
 */
@Module({
  imports: [DatabaseModule],
  providers: [PgListenerService, StreamPublisherService],
  exports: [PgListenerService, StreamPublisherService],
})
export class RealtimeModule {}
