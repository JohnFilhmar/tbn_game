import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type {
  CreateNotificationChannel,
  Notification,
  NotificationChannel,
  NotificationEventType,
  NotificationListQuery,
  NotificationPriority,
  UpdateNotificationChannel,
} from '@tbn/contracts';
import type { ProcessType } from '@tbn/contracts';
import { PROCESS_TYPE } from '@/config/config.tokens';
import { QueueService } from '@/lib/queue/queue.service';
import type { NotifyJob } from '@/lib/queue/queues';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository,
} from '@/modules/integrations/repositories/interface/integration_repository.interface';
import type {
  NotificationChannelRecord,
  NotificationRecord,
} from '@/modules/integrations/types/integration_records';
import { IntegrationService } from './integration.service';
import { NOTIFICATION_EVENTS } from './notification_events';
import { render_template } from './template_renderer';

/** What an event says. */
export interface NotificationEvent {
  event_type: NotificationEventType;
  title: string;
  message: string;
  priority: NotificationPriority;
  /** The event's own placeholders, besides the common ones. */
  values: Record<string, string>;
}

/** Maps a channel row to the API shape. */
export function to_channel_view(record: NotificationChannelRecord): NotificationChannel {
  return {
    id: record.id,
    event_type: record.event_type,
    integration_id: record.integration_id,
    body_template: record.body_template,
    enabled: record.enabled,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

/** Maps a notification row to the API shape. */
export function to_notification_view(record: NotificationRecord): Notification {
  return {
    id: record.id,
    event_type: record.event_type,
    channel_id: record.channel_id,
    integration_id: record.integration_id,
    title: record.title,
    message: record.message,
    priority: record.priority,
    status: record.status,
    attempts: record.attempts,
    response_status: record.response_status,
    error: record.error,
    created_at: record.created_at.toISOString(),
    sent_at: record.sent_at?.toISOString() ?? null,
  };
}

/** Raised by a delivery that did not reach the integration, so the queue retries it. */
export class NotificationDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationDeliveryError';
  }
}

/**
 * Notifications: the channels that bind events to integrations, the log of every notification,
 * and the sending. `emit` writes the rows and queues one job per channel; the worker delivers
 * with the queue's three attempts and records each outcome. An event with no channel is logged
 * and goes nowhere.
 */
@Injectable()
export class NotificationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository,
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
    private readonly integrations: IntegrationService,
    private readonly queue: QueueService,
  ) {}

  /** The worker takes notify jobs; the other processes only emit. */
  onApplicationBootstrap(): void {
    if (this.process_type !== 'worker') return;
    this.start_delivery().catch((error: unknown) => {
      if (this.queue.stopping) return;
      this.logger.error(
        `Cannot take notify jobs: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    });
  }

  async list_channels(owner_id: string): Promise<NotificationChannel[]> {
    return (await this.notifications.list_channels(owner_id)).map(to_channel_view);
  }

  async create_channel(
    owner_id: string,
    input: CreateNotificationChannel,
  ): Promise<NotificationChannel> {
    await this.integrations.require(owner_id, input.integration_id);
    const record = await this.notifications.create_channel(owner_id, {
      event_type: input.event_type,
      integration_id: input.integration_id,
      body_template: input.body_template ?? null,
      enabled: input.enabled ?? true,
    });
    return to_channel_view(record);
  }

  async update_channel(
    owner_id: string,
    id: string,
    input: UpdateNotificationChannel,
  ): Promise<NotificationChannel> {
    if (input.integration_id !== undefined) {
      await this.integrations.require(owner_id, input.integration_id);
    }
    const record = await this.notifications.update_channel(owner_id, id, {
      ...(input.event_type !== undefined && { event_type: input.event_type }),
      ...(input.integration_id !== undefined && { integration_id: input.integration_id }),
      ...(input.body_template !== undefined && { body_template: input.body_template }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
    });
    if (record === null) throw new NotFoundException('Notification channel not found');
    return to_channel_view(record);
  }

  async delete_channel(owner_id: string, id: string): Promise<void> {
    if (!(await this.notifications.delete_channel(owner_id, id))) {
      throw new NotFoundException('Notification channel not found');
    }
  }

  async list(owner_id: string, query: NotificationListQuery): Promise<Notification[]> {
    return (await this.notifications.list(owner_id, query)).map(to_notification_view);
  }

  /** Records the event for the owner and queues a send on every enabled channel. */
  async emit(owner_id: string, event: NotificationEvent): Promise<Notification[]> {
    const channels = await this.notifications.enabled_channels(owner_id, event.event_type);
    const base = {
      event_type: event.event_type,
      title: event.title,
      message: `${event.message}\n${JSON.stringify(event.values)}`,
      priority: event.priority,
    };
    if (channels.length === 0) {
      const logged = await this.notifications.create(owner_id, {
        ...base,
        channel_id: null,
        integration_id: null,
        status: 'sent',
      });
      return [to_notification_view(logged)];
    }
    const rows: Notification[] = [];
    for (const { channel, integration } of channels) {
      const row = await this.notifications.create(owner_id, {
        ...base,
        channel_id: channel.id,
        integration_id: integration.id,
        status: 'pending',
      });
      await this.queue.send_notify({ owner_id, notification_id: row.id });
      rows.push(to_notification_view(row));
    }
    return rows;
  }

  /** Every owner with an enabled channel for the event. */
  owners_listening(event_type: NotificationEventType): Promise<string[]> {
    return this.notifications.owners_listening(event_type);
  }

  /** Emits a server-wide event to every owner listening for it. */
  async emit_to_listeners(event: NotificationEvent): Promise<void> {
    for (const owner_id of await this.notifications.owners_listening(event.event_type)) {
      await this.emit(owner_id, event);
    }
  }

  /**
   * One delivery attempt, by the worker: renders the channel's body or the event's default and
   * calls the integration with the event's values. Throws when the integration did not take it,
   * so the queue tries again; the row keeps every attempt's outcome.
   */
  async deliver(job: NotifyJob): Promise<void> {
    const row = await this.notifications.find(job.owner_id, job.notification_id);
    if (row === null || row.status === 'sent' || row.channel_id === null) return;
    const channel = await this.notifications.find_channel(job.owner_id, row.channel_id);
    const integration =
      row.integration_id === null
        ? null
        : await this.integrations.require(job.owner_id, row.integration_id).catch(() => null);
    if (channel === null || integration === null) {
      await this.notifications.record_attempt(job.owner_id, row.id, {
        status: 'failed',
        response_status: null,
        error: 'The channel or its integration is gone',
        sent_at: null,
      });
      return;
    }
    const [message, encoded_values] = row.message.split('\n');
    let extra: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(encoded_values ?? '{}');
      if (typeof parsed === 'object' && parsed !== null) {
        extra = Object.fromEntries(
          Object.entries(parsed).map(([name, value]) => [name, String(value)]),
        );
      }
    } catch {
      extra = {};
    }
    const values: Record<string, string> = {
      ...extra,
      event: row.event_type,
      priority: row.priority,
      title: row.title,
      message: message ?? '',
      time: row.created_at.toISOString(),
    };
    const body = render_template(
      channel.body_template ?? NOTIFICATION_EVENTS[row.event_type].default_body,
      values,
      'raw',
    );
    const result = await this.integrations.call(integration, { ...values, body });
    const delivered = result.status >= 200 && result.status < 300;
    await this.notifications.record_attempt(job.owner_id, row.id, {
      status: delivered ? 'sent' : 'failed',
      response_status: result.status === 0 ? null : result.status,
      error: delivered ? null : result.excerpt.slice(0, 500),
      sent_at: delivered ? new Date() : null,
    });
    if (!delivered) {
      this.logger.warn(
        `Notification ${row.id} (${row.event_type}) was not delivered: ${result.status === 0 ? result.excerpt : `HTTP ${result.status}`}`,
      );
      throw new NotificationDeliveryError(`Notification ${row.id} was not delivered`);
    }
  }

  /** The worker takes notify jobs. */
  async start_delivery(): Promise<void> {
    await this.queue.work_notify((job) => this.deliver(job));
  }
}
