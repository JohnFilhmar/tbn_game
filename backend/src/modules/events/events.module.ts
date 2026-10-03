import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/lib/database/database.module';
import { IdempotencyModule } from '@/lib/idempotency/idempotency.module';
import { MetricsModule } from '@/lib/metrics/metrics.module';
import { RealtimeModule } from '@/lib/realtime/realtime.module';
import { CompanyModule } from '@/modules/company/company.module';
import { IdentityModule } from '@/modules/identity/identity.module';
import { IntegrationsModule } from '@/modules/integrations/integrations.module';
import { KnowledgeModule } from '@/modules/knowledge/knowledge.module';
import { RuntimeModule } from '@/modules/runtime/runtime.module';
import { WorldModule } from '@/modules/world/world.module';
import { EventController } from './controllers/event.controller';
import { EVENT_REPOSITORY } from './repositories/interface/event_repository.interface';
import { PrismaEventRepository } from './repositories/prisma_event.repository';
import { EventFeedService } from './services/event_feed.service';
import { EventHydratorService } from './services/event_hydrator.service';
import { RealtimeGatewayService } from './services/realtime_gateway.service';
import { RetentionService } from './services/retention.service';

/**
 * The event log, read by owner and sent to clients with each entity's current view, over
 * `GET /events` and the Socket.IO gateway of the web process. A database trigger writes the log;
 * this module reads it through the other modules' exported services, so it depends on all of them
 * and nothing depends on it. The worker prunes the log and the command store.
 */
@Module({
  imports: [
    DatabaseModule,
    IdempotencyModule,
    MetricsModule,
    RealtimeModule,
    IdentityModule,
    CompanyModule,
    RuntimeModule,
    KnowledgeModule,
    IntegrationsModule,
    WorldModule,
  ],
  controllers: [EventController],
  providers: [
    { provide: EVENT_REPOSITORY, useClass: PrismaEventRepository },
    EventHydratorService,
    EventFeedService,
    RealtimeGatewayService,
    RetentionService,
  ],
  exports: [EventFeedService, RealtimeGatewayService],
})
export class EventsModule {}
