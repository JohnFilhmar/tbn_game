import {
  NotificationEventTypeSchema,
  type NotificationEventInfo,
  type NotificationEventType,
} from '@tbn/contracts';

/** The placeholders every event provides, besides its own. */
export const COMMON_PLACEHOLDERS: NotificationEventInfo['placeholders'] = [
  { name: 'event', description: 'The event type' },
  { name: 'priority', description: 'normal or high' },
  { name: 'title', description: 'A one-line title' },
  { name: 'message', description: 'What happened, in a sentence or two' },
  { name: 'time', description: 'When it happened, as an ISO timestamp' },
];

/** Each event type: what it means, the placeholders of its own, and the body sent by default. */
export const NOTIFICATION_EVENTS: Record<
  NotificationEventType,
  Omit<NotificationEventInfo, 'event_type'>
> = {
  process_restarted: {
    description:
      'A process found at boot that its previous instance stopped without a clean shutdown.',
    placeholders: [{ name: 'process_type', description: 'web, worker or sandbox' }],
    default_body: '[{{priority}}] {{title}}\n{{message}}\n{{event}} at {{time}}',
  },
  runs_resumed: {
    description: 'The worker re-woke runs whose worker died, on its first sweep after boot.',
    placeholders: [{ name: 'count', description: 'How many runs were re-woken' }],
    default_body: '[{{priority}}] {{title}}\n{{message}}\n{{event}} at {{time}}',
  },
  run_failed: {
    description: 'A run ended with an error and its task failed.',
    placeholders: [
      { name: 'agent_name', description: 'The agent whose run failed' },
      { name: 'task_title', description: 'The task, when the run had one' },
      { name: 'error', description: 'The error' },
    ],
    default_body: '[{{priority}}] {{title}}\n{{message}}\n{{event}} at {{time}}',
  },
  cap_threshold_passed: {
    description: 'A cap window of a key passed its threshold or reached its limit.',
    placeholders: [
      { name: 'provider_name', description: 'The key' },
      { name: 'window_name', description: 'The cap window' },
      { name: 'state', description: 'past_threshold or at_limit' },
    ],
    default_body: '[{{priority}}] {{title}}\n{{message}}\n{{event}} at {{time}}',
  },
  provider_out_of_credit: {
    description:
      'A key was refused for credit; every task on it is blocked until the owner resumes it.',
    placeholders: [{ name: 'provider_name', description: 'The key' }],
    default_body: '[{{priority}}] {{title}}\n{{message}}\n{{event}} at {{time}}',
  },
  backup_failed: {
    description: 'A backup did not complete. Reserved for phase 2; nothing emits it yet.',
    placeholders: [{ name: 'error', description: 'The error' }],
    default_body: '[{{priority}}] {{title}}\n{{message}}\n{{event}} at {{time}}',
  },
  disk_nearly_full: {
    description: 'The workspace volume passed the disk alert percentage.',
    placeholders: [{ name: 'used_percent', description: 'How full the volume is' }],
    default_body: '[{{priority}}] {{title}}\n{{message}}\n{{event}} at {{time}}',
  },
  approval_waiting: {
    description: 'A tool call or the runaway guard waits for the owner in the approval inbox.',
    placeholders: [
      { name: 'agent_name', description: 'The agent that asked' },
      { name: 'tool_name', description: 'The tool, or runaway_guard' },
      { name: 'approval_id', description: 'The approval to decide' },
    ],
    default_body: '[{{priority}}] {{title}}\n{{message}}\n{{event}} at {{time}}',
  },
  report_finished: {
    description: 'An agent finished a task the owner assigned and wrote its report.',
    placeholders: [
      { name: 'agent_name', description: 'The agent' },
      { name: 'task_title', description: 'The task' },
      { name: 'report_id', description: 'The report' },
    ],
    default_body: '[{{priority}}] {{title}}\n{{message}}\n{{event}} at {{time}}',
  },
};

/** The catalogue as `GET /notification_events` returns it. */
export function notification_event_catalogue(): NotificationEventInfo[] {
  return NotificationEventTypeSchema.options.map((event_type) => ({
    event_type,
    description: NOTIFICATION_EVENTS[event_type].description,
    placeholders: [...COMMON_PLACEHOLDERS, ...NOTIFICATION_EVENTS[event_type].placeholders],
    default_body: NOTIFICATION_EVENTS[event_type].default_body,
  }));
}
