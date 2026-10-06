import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  CreateNotificationChannelSchema,
  IdSchema,
  NotificationListQuerySchema,
  UpdateNotificationChannelSchema,
  type CreateNotificationChannel,
  type Notification,
  type NotificationChannel,
  type NotificationEventInfo,
  type NotificationListQuery,
  type UpdateNotificationChannel,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam, ZodQuery } from '@/lib/validation/zod.decorator';
import { NotificationService } from '@/modules/integrations/services/notification.service';
import { notification_event_catalogue } from '@/modules/integrations/services/notification_events';
import { OwnerOnly } from '@/lib/auth/guest_policy.decorator';

/** The event catalogue: what the system can notify about, with placeholders and default bodies. */
@Controller('notification_events')
export class NotificationEventController {
  @Get()
  list(): NotificationEventInfo[] {
    return notification_event_catalogue();
  }
}

/** Channels: an integration attached to an event type. */
@OwnerOnly()
@Controller('notification_channels')
export class NotificationChannelController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentOwner() owner: AuthenticatedOwner): Promise<NotificationChannel[]> {
    return this.notifications.list_channels(owner.id);
  }

  @Post()
  create(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(CreateNotificationChannelSchema) body: CreateNotificationChannel,
  ): Promise<NotificationChannel> {
    return this.notifications.create_channel(owner.id, body);
  }

  @Patch(':id')
  update(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(UpdateNotificationChannelSchema) body: UpdateNotificationChannel,
  ): Promise<NotificationChannel> {
    return this.notifications.update_channel(owner.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<void> {
    return this.notifications.delete_channel(owner.id, id);
  }
}

/** The notification log. */
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodQuery(NotificationListQuerySchema) query: NotificationListQuery,
  ): Promise<Notification[]> {
    return this.notifications.list(owner.id, query);
  }
}
