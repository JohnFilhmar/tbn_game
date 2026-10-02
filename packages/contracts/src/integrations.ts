import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

/** The HTTP methods an integration may use. */
export const IntegrationMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/** An integration's HTTP method. */
export type IntegrationMethod = z.infer<typeof IntegrationMethodSchema>;

/** How the body template is rendered and how placeholder values are escaped inside it. */
export const IntegrationBodyFormatSchema = z.enum(['json', 'form', 'text', 'none']);

/** `json`, `form`, `text` or `none`. */
export type IntegrationBodyFormat = z.infer<typeof IntegrationBodyFormatSchema>;

/** A placeholder name as it appears between double braces. */
export const PlaceholderNameSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, 'lowercase letters, digits and underscores, starting with a letter');

/** The placeholder that stands for the integration's token. */
export const TOKEN_PLACEHOLDER = 'token';

/** A value the caller supplies for a template. */
export const IntegrationPlaceholderSchema = z.strictObject({
  name: PlaceholderNameSchema,
  description: z.string().trim().min(1).max(500),
  required: z.boolean(),
});

/** A declared placeholder. */
export type IntegrationPlaceholder = z.infer<typeof IntegrationPlaceholderSchema>;

const HeaderNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9-]+$/, 'a header name');

/** The names between double braces in a template, in order of first appearance. */
export function template_placeholders(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    const name = match[1] ?? '';
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** The fields of an integration that hold templates. */
export interface IntegrationTemplates {
  url: string;
  headers: Record<string, string>;
  body_template: string | null;
  placeholders: readonly { name: string }[];
}

/**
 * Returns why the templates of an integration are not valid, or null when they are: every
 * placeholder they use must be declared, apart from `token`, and no name may be declared twice.
 */
export function integration_template_problem(templates: IntegrationTemplates): string | null {
  const declared = templates.placeholders.map((placeholder) => placeholder.name);
  if (new Set(declared).size !== declared.length) return 'a placeholder is declared twice';
  const allowed = new Set([...declared, TOKEN_PLACEHOLDER]);
  const texts = [templates.url, ...Object.values(templates.headers), templates.body_template ?? ''];
  for (const text of texts) {
    for (const name of template_placeholders(text)) {
      if (!allowed.has(name)) return `unknown placeholder {{${name}}}`;
    }
  }
  return null;
}

/**
 * An HTTP request template the owner defines. `{{name}}` placeholders are replaced with escaping
 * for the body format and nothing else. The token is write-only, encrypted at rest and applied
 * where `{{token}}` appears, and `token_set` says whether one is saved.
 */
export const IntegrationSchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1).max(100),
  method: IntegrationMethodSchema,
  url: z.string().trim().min(1).max(2_000),
  headers: z.record(HeaderNameSchema, z.string().max(2_000)),
  token_set: z.boolean(),
  body_format: IntegrationBodyFormatSchema,
  body_template: z.string().max(50_000).nullable(),
  placeholders: z.array(IntegrationPlaceholderSchema).max(50),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** An integration as the API returns it. */
export type Integration = z.infer<typeof IntegrationSchema>;

const IntegrationWriteSchema = IntegrationSchema.pick({
  name: true,
  method: true,
  url: true,
  headers: true,
  body_format: true,
  body_template: true,
  placeholders: true,
});

/** Body of `POST /integrations`. Unknown placeholders in a template are rejected here. */
export const CreateIntegrationSchema = IntegrationWriteSchema.partial({
  headers: true,
  body_format: true,
  body_template: true,
  placeholders: true,
})
  .extend({ token: z.string().min(1).max(4_096).optional() })
  .superRefine((value, context) => {
    const problem = integration_template_problem({
      url: value.url,
      headers: value.headers ?? {},
      body_template: value.body_template ?? null,
      placeholders: value.placeholders ?? [],
    });
    if (problem !== null) {
      context.addIssue({ code: 'custom', message: problem, path: ['placeholders'] });
    }
  });

/** Body of `POST /integrations`. */
export type CreateIntegration = z.infer<typeof CreateIntegrationSchema>;

/** Body of `PATCH /integrations/:id`. The templates are checked together after merging. */
export const UpdateIntegrationSchema = IntegrationWriteSchema.partial().extend({
  token: z.string().min(1).max(4_096).optional(),
});

/** Body of `PATCH /integrations/:id`. */
export type UpdateIntegration = z.infer<typeof UpdateIntegrationSchema>;

/** Placeholder values for one call: the agent's input, or the owner's test values. */
export const PlaceholderValuesSchema = z.record(PlaceholderNameSchema, z.string().max(20_000));

/** Placeholder values. */
export type PlaceholderValues = z.infer<typeof PlaceholderValuesSchema>;

/** Body of `POST /integrations/:id/test`. */
export const TestIntegrationSchema = z.strictObject({ values: PlaceholderValuesSchema });

/** Body of `POST /integrations/:id/test`. */
export type TestIntegration = z.infer<typeof TestIntegrationSchema>;

/** What a call returned: the status and the start of the body. */
export const IntegrationCallResultSchema = z.strictObject({
  status: z.number().int().min(0).max(999),
  excerpt: z.string(),
  duration_ms: z.number().int().min(0),
});

/** The result of an integration call. */
export type IntegrationCallResult = z.infer<typeof IntegrationCallResultSchema>;

/** The system events an integration can be attached to as a notification channel. */
export const NotificationEventTypeSchema = z.enum([
  'process_restarted',
  'runs_resumed',
  'run_failed',
  'cap_threshold_passed',
  'provider_out_of_credit',
  'backup_failed',
  'disk_nearly_full',
  'approval_waiting',
  'report_finished',
]);

/** A notification event type. */
export type NotificationEventType = z.infer<typeof NotificationEventTypeSchema>;

/** How urgent a notification is; a channel that supports it marks the message. */
export const NotificationPrioritySchema = z.enum(['normal', 'high']);

/** `normal` or `high`. */
export type NotificationPriority = z.infer<typeof NotificationPrioritySchema>;

/** An integration attached to a system event, with an optional body of its own. */
export const NotificationChannelSchema = z.strictObject({
  id: IdSchema,
  event_type: NotificationEventTypeSchema,
  integration_id: IdSchema,
  body_template: z.string().max(50_000).nullable(),
  enabled: z.boolean(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** A notification channel as the API returns it. */
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

/** Body of `POST /notification_channels`. */
export const CreateNotificationChannelSchema = NotificationChannelSchema.pick({
  event_type: true,
  integration_id: true,
  body_template: true,
  enabled: true,
}).partial({ body_template: true, enabled: true });

/** Body of `POST /notification_channels`. */
export type CreateNotificationChannel = z.infer<typeof CreateNotificationChannelSchema>;

/** Body of `PATCH /notification_channels/:id`. */
export const UpdateNotificationChannelSchema = CreateNotificationChannelSchema.partial();

/** Body of `PATCH /notification_channels/:id`. */
export type UpdateNotificationChannel = z.infer<typeof UpdateNotificationChannelSchema>;

/** One entry of `GET /notification_events`: an event type with its placeholders. */
export const NotificationEventInfoSchema = z.strictObject({
  event_type: NotificationEventTypeSchema,
  description: z.string(),
  placeholders: z.array(z.strictObject({ name: PlaceholderNameSchema, description: z.string() })),
  default_body: z.string(),
});

/** An event type's documentation. */
export type NotificationEventInfo = z.infer<typeof NotificationEventInfoSchema>;

/** Where a notification is. */
export const NotificationStatusSchema = z.enum(['pending', 'sent', 'failed']);

/** A notification status. */
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

/** One notification the system sent, or tried to. */
export const NotificationSchema = z.strictObject({
  id: IdSchema,
  event_type: NotificationEventTypeSchema,
  channel_id: IdSchema.nullable(),
  integration_id: IdSchema.nullable(),
  title: z.string(),
  message: z.string(),
  priority: NotificationPrioritySchema,
  status: NotificationStatusSchema,
  attempts: z.number().int().min(0),
  response_status: z.number().int().nullable(),
  error: z.string().nullable(),
  created_at: DateTimeSchema,
  sent_at: DateTimeSchema.nullable(),
});

/** A notification as the API returns it. */
export type Notification = z.infer<typeof NotificationSchema>;

/** Query of `GET /notifications`. */
export const NotificationListQuerySchema = z.strictObject({
  status: NotificationStatusSchema.optional(),
  event_type: NotificationEventTypeSchema.optional(),
});

/** Query of `GET /notifications`. */
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;
