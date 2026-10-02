import type { NotificationEventType, NotificationListQuery, ProcessType } from '@tbn/contracts';
import type {
  IntegrationAttachmentRecord,
  IntegrationRecord,
  IntegrationWrite,
  NotificationAttempt,
  NotificationChannelRecord,
  NotificationChannelWrite,
  NotificationRecord,
  NotificationWrite,
  PluginAttachmentRecord,
  PluginRecord,
  PluginWrite,
  ProcessInstanceRecord,
} from '@/modules/integrations/types/integration_records';

/** Injection token for `IntegrationRepository`. */
export const INTEGRATION_REPOSITORY = Symbol('INTEGRATION_REPOSITORY');

/** Injection token for `NotificationRepository`. */
export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

/** Injection token for `PluginRepository`. */
export const PLUGIN_REPOSITORY = Symbol('PLUGIN_REPOSITORY');

/** Injection token for `ProcessInstanceRepository`. */
export const PROCESS_INSTANCE_REPOSITORY = Symbol('PROCESS_INSTANCE_REPOSITORY');

/** Integration rows and their attachments to agents, scoped by owner. */
export interface IntegrationRepository {
  list(owner_id: string): Promise<IntegrationRecord[]>;
  find(owner_id: string, id: string): Promise<IntegrationRecord | null>;
  find_by_name(owner_id: string, name: string): Promise<IntegrationRecord | null>;
  create(owner_id: string, write: IntegrationWrite): Promise<IntegrationRecord>;
  update(
    owner_id: string,
    id: string,
    write: Partial<IntegrationWrite>,
  ): Promise<IntegrationRecord | null>;
  /** True when a row was deleted. */
  delete(owner_id: string, id: string): Promise<boolean>;
  /** Attaches an integration to an agent. A second attachment changes nothing. */
  attach(
    owner_id: string,
    integration_id: string,
    agent_id: string,
  ): Promise<IntegrationAttachmentRecord>;
  /** True when an attachment was removed. */
  detach(owner_id: string, integration_id: string, agent_id: string): Promise<boolean>;
  /** The integrations attached to an agent, by name. */
  list_for_agent(owner_id: string, agent_id: string): Promise<IntegrationRecord[]>;
}

/** Notification channels and the notification log, scoped by owner. */
export interface NotificationRepository {
  list_channels(owner_id: string): Promise<NotificationChannelRecord[]>;
  find_channel(owner_id: string, id: string): Promise<NotificationChannelRecord | null>;
  create_channel(
    owner_id: string,
    write: NotificationChannelWrite,
  ): Promise<NotificationChannelRecord>;
  update_channel(
    owner_id: string,
    id: string,
    write: Partial<NotificationChannelWrite>,
  ): Promise<NotificationChannelRecord | null>;
  /** True when a row was deleted. */
  delete_channel(owner_id: string, id: string): Promise<boolean>;
  /** The enabled channels of an event, with their integrations. */
  enabled_channels(
    owner_id: string,
    event_type: NotificationEventType,
  ): Promise<{ channel: NotificationChannelRecord; integration: IntegrationRecord }[]>;
  /** Every owner with an enabled channel for the event, for events that concern the server. */
  owners_listening(event_type: NotificationEventType): Promise<string[]>;
  list(owner_id: string, query: NotificationListQuery): Promise<NotificationRecord[]>;
  find(owner_id: string, id: string): Promise<NotificationRecord | null>;
  create(owner_id: string, write: NotificationWrite): Promise<NotificationRecord>;
  /** Records one delivery attempt and its outcome. */
  record_attempt(
    owner_id: string,
    id: string,
    attempt: NotificationAttempt,
  ): Promise<NotificationRecord | null>;
}

/** Plugin rows and their attachments to agents, scoped by owner. */
export interface PluginRepository {
  list(owner_id: string): Promise<PluginRecord[]>;
  find(owner_id: string, id: string): Promise<PluginRecord | null>;
  find_by_name(owner_id: string, name: string): Promise<PluginRecord | null>;
  create(owner_id: string, write: PluginWrite): Promise<PluginRecord>;
  update(owner_id: string, id: string, write: Partial<PluginWrite>): Promise<PluginRecord | null>;
  /** True when a row was deleted. */
  delete(owner_id: string, id: string): Promise<boolean>;
  attach(owner_id: string, plugin_id: string, agent_id: string): Promise<PluginAttachmentRecord>;
  /** True when an attachment was removed. */
  detach(owner_id: string, plugin_id: string, agent_id: string): Promise<boolean>;
  /** The enabled plugins attached to an agent, by name. */
  list_for_agent(owner_id: string, agent_id: string): Promise<PluginRecord[]>;
}

/** Process boots, for restart detection. Not scoped: processes belong to the server. */
export interface ProcessInstanceRepository {
  create(process_type: ProcessType, instance_id: string): Promise<ProcessInstanceRecord>;
  /** Boots of the type that never recorded a clean stop. */
  find_unstopped(process_type: ProcessType): Promise<ProcessInstanceRecord[]>;
  mark_stopped(ids: string[], at: Date): Promise<void>;
}
