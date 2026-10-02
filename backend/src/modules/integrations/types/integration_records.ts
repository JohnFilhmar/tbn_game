import type {
  IntegrationBodyFormat,
  IntegrationMethod,
  IntegrationPlaceholder,
  NotificationEventType,
  NotificationPriority,
  NotificationStatus,
  ProcessType,
} from '@tbn/contracts';

/** An integration row. `headers` and `placeholders` are JSON columns, parsed when mapped. */
export interface IntegrationRecord {
  id: string;
  owner_id: string;
  name: string;
  method: IntegrationMethod;
  url: string;
  headers: unknown;
  token_ciphertext: string | null;
  body_format: IntegrationBodyFormat;
  body_template: string | null;
  placeholders: unknown;
  created_at: Date;
  updated_at: Date;
}

/** Fields written when an integration is created or edited. */
export interface IntegrationWrite {
  name: string;
  method: IntegrationMethod;
  url: string;
  headers: Record<string, string>;
  token_ciphertext: string | null;
  body_format: IntegrationBodyFormat;
  body_template: string | null;
  placeholders: IntegrationPlaceholder[];
}

/** An integration attached to an agent as a tool. */
export interface IntegrationAttachmentRecord {
  id: string;
  owner_id: string;
  integration_id: string;
  agent_id: string;
  created_at: Date;
}

/** A notification channel row. */
export interface NotificationChannelRecord {
  id: string;
  owner_id: string;
  event_type: NotificationEventType;
  integration_id: string;
  body_template: string | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Fields written when a channel is created or edited. */
export interface NotificationChannelWrite {
  event_type: NotificationEventType;
  integration_id: string;
  body_template: string | null;
  enabled: boolean;
}

/** A notification row. */
export interface NotificationRecord {
  id: string;
  owner_id: string;
  channel_id: string | null;
  integration_id: string | null;
  event_type: NotificationEventType;
  title: string;
  message: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  attempts: number;
  response_status: number | null;
  error: string | null;
  created_at: Date;
  sent_at: Date | null;
}

/** Fields written when a notification is recorded. */
export interface NotificationWrite {
  channel_id: string | null;
  integration_id: string | null;
  event_type: NotificationEventType;
  title: string;
  message: string;
  priority: NotificationPriority;
  status: NotificationStatus;
}

/** The outcome of one delivery attempt. */
export interface NotificationAttempt {
  status: NotificationStatus;
  response_status: number | null;
  error: string | null;
  sent_at: Date | null;
}

/** A plugin row. The token is sealed. */
export interface PluginRecord {
  id: string;
  owner_id: string;
  name: string;
  url: string;
  token_ciphertext: string | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Fields written when a plugin is created or edited. */
export interface PluginWrite {
  name: string;
  url: string;
  token_ciphertext: string | null;
  enabled: boolean;
}

/** A plugin attached to an agent. */
export interface PluginAttachmentRecord {
  id: string;
  owner_id: string;
  plugin_id: string;
  agent_id: string;
  created_at: Date;
}

/** One boot of a process. No owner: processes belong to the server. */
export interface ProcessInstanceRecord {
  id: string;
  process_type: ProcessType;
  instance_id: string;
  started_at: Date;
  stopped_at: Date | null;
}
