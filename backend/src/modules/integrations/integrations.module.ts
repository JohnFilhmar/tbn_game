import { Module } from '@nestjs/common';
import { CryptoModule } from '@/lib/crypto/crypto.module';
import { DatabaseModule } from '@/lib/database/database.module';
import { QueueModule } from '@/lib/queue/queue.module';
import { IntegrationController } from './controllers/integration.controller';
import {
  NotificationChannelController,
  NotificationController,
  NotificationEventController,
} from './controllers/notification.controller';
import { PluginController } from './controllers/plugin.controller';
import {
  INTEGRATION_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  PLUGIN_REPOSITORY,
  PROCESS_INSTANCE_REPOSITORY,
} from './repositories/interface/integration_repository.interface';
import {
  PrismaIntegrationRepository,
  PrismaPluginRepository,
  PrismaProcessInstanceRepository,
} from './repositories/prisma_integration.repository';
import { PrismaNotificationRepository } from './repositories/prisma_notification.repository';
import { IntegrationService } from './services/integration.service';
import { NotificationService } from './services/notification.service';
import { PluginService } from './services/plugin.service';
import { ProcessInstanceService } from './services/process_instance.service';

/**
 * Request templates with sealed tokens, notification channels and the notification log, MCP
 * plugins, and restart detection. It depends on the database, the queue and crypto only, so the
 * company and runtime modules may depend on it.
 */
@Module({
  imports: [DatabaseModule, QueueModule, CryptoModule],
  controllers: [
    IntegrationController,
    NotificationEventController,
    NotificationChannelController,
    NotificationController,
    PluginController,
  ],
  providers: [
    { provide: INTEGRATION_REPOSITORY, useClass: PrismaIntegrationRepository },
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
    { provide: PLUGIN_REPOSITORY, useClass: PrismaPluginRepository },
    { provide: PROCESS_INSTANCE_REPOSITORY, useClass: PrismaProcessInstanceRepository },
    IntegrationService,
    NotificationService,
    PluginService,
    ProcessInstanceService,
  ],
  exports: [IntegrationService, NotificationService, PluginService, ProcessInstanceService],
})
export class IntegrationsModule {}
