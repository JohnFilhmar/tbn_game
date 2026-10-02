import { Injectable } from '@nestjs/common';
import type { NotificationEventType, NotificationListQuery } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import type {
  IntegrationRecord,
  NotificationAttempt,
  NotificationChannelRecord,
  NotificationChannelWrite,
  NotificationRecord,
  NotificationWrite,
} from '@/modules/integrations/types/integration_records';
import type { NotificationRepository } from './interface/integration_repository.interface';

const LIST_LIMIT = 200;

/** `NotificationRepository` on Prisma. */
@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  list_channels(owner_id: string): Promise<NotificationChannelRecord[]> {
    return this.prisma.notificationChannel.findMany({
      where: { owner_id },
      orderBy: [{ event_type: 'asc' }, { created_at: 'asc' }],
    });
  }

  find_channel(owner_id: string, id: string): Promise<NotificationChannelRecord | null> {
    return this.prisma.notificationChannel.findFirst({ where: { id, owner_id } });
  }

  create_channel(
    owner_id: string,
    write: NotificationChannelWrite,
  ): Promise<NotificationChannelRecord> {
    return this.prisma.notificationChannel.create({ data: { owner_id, ...write } });
  }

  async update_channel(
    owner_id: string,
    id: string,
    write: Partial<NotificationChannelWrite>,
  ): Promise<NotificationChannelRecord | null> {
    const result = await this.prisma.notificationChannel.updateMany({
      where: { id, owner_id },
      data: write,
    });
    return result.count === 0 ? null : this.find_channel(owner_id, id);
  }

  async delete_channel(owner_id: string, id: string): Promise<boolean> {
    const result = await this.prisma.notificationChannel.deleteMany({ where: { id, owner_id } });
    return result.count > 0;
  }

  async enabled_channels(
    owner_id: string,
    event_type: NotificationEventType,
  ): Promise<{ channel: NotificationChannelRecord; integration: IntegrationRecord }[]> {
    const rows = await this.prisma.notificationChannel.findMany({
      where: { owner_id, event_type, enabled: true },
      include: { integration: true },
      orderBy: { created_at: 'asc' },
    });
    return rows.map(({ integration, ...channel }) => ({ channel, integration }));
  }

  async owners_listening(event_type: NotificationEventType): Promise<string[]> {
    const rows = await this.prisma.notificationChannel.findMany({
      where: { event_type, enabled: true },
      select: { owner_id: true },
      distinct: ['owner_id'],
    });
    return rows.map((row) => row.owner_id);
  }

  list(owner_id: string, query: NotificationListQuery): Promise<NotificationRecord[]> {
    return this.prisma.notification.findMany({
      where: {
        owner_id,
        ...(query.status !== undefined && { status: query.status }),
        ...(query.event_type !== undefined && { event_type: query.event_type }),
      },
      orderBy: { created_at: 'desc' },
      take: LIST_LIMIT,
    });
  }

  find(owner_id: string, id: string): Promise<NotificationRecord | null> {
    return this.prisma.notification.findFirst({ where: { id, owner_id } });
  }

  create(owner_id: string, write: NotificationWrite): Promise<NotificationRecord> {
    return this.prisma.notification.create({ data: { owner_id, ...write } });
  }

  async record_attempt(
    owner_id: string,
    id: string,
    attempt: NotificationAttempt,
  ): Promise<NotificationRecord | null> {
    const result = await this.prisma.notification.updateMany({
      where: { id, owner_id },
      data: {
        status: attempt.status,
        response_status: attempt.response_status,
        error: attempt.error,
        sent_at: attempt.sent_at,
        attempts: { increment: 1 },
      },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }
}
