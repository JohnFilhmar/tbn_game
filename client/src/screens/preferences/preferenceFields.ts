import type { PreferenceKey } from '@tbn/contracts';

/** How a preference is edited. */
export type PreferenceKind =
  | { type: 'choice'; options: ReadonlyArray<{ value: string; label: string }> }
  | {
      type: 'number';
      isOptional: boolean;
      /** Shown after the label; empty when the label says it. */ unit: string;
    }
  | { type: 'text' };

/** One preference as the screen shows it. */
export interface PreferenceField {
  key: PreferenceKey;
  label: string;
  hint: string;
  kind: PreferenceKind;
}

/** A group of preferences on the screen. */
export interface PreferenceGroup {
  title: string;
  fields: readonly PreferenceField[];
}

/** Every preference the screen edits, grouped, with how it reads and how it is typed. */
export const PREFERENCE_GROUPS: readonly PreferenceGroup[] = [
  {
    title: 'World',
    fields: [
      {
        key: 'environment',
        label: 'Environment',
        hint: 'Where the company is. The world menu changes it too.',
        kind: {
          type: 'choice',
          options: [
            { value: 'office', label: 'Office' },
            { value: 'home', label: 'Home' },
            { value: 'warehouse', label: 'Warehouse' },
          ],
        },
      },
      {
        key: 'time_of_day',
        label: 'Time of day',
        hint: 'My clock follows your time zone.',
        kind: {
          type: 'choice',
          options: [
            { value: 'morning', label: 'Morning' },
            { value: 'noon', label: 'Noon' },
            { value: 'afternoon', label: 'Afternoon' },
            { value: 'night', label: 'Night' },
            { value: 'clock', label: 'My clock' },
          ],
        },
      },
    ],
  },
  {
    title: 'Desk',
    fields: [
      {
        key: 'theme',
        label: 'Theme',
        hint: 'System follows this device.',
        kind: {
          type: 'choice',
          options: [
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ],
        },
      },
      {
        key: 'time_zone',
        label: 'Time zone',
        hint: 'An IANA name such as Europe/Berlin. Dates on the desk use it.',
        kind: { type: 'text' },
      },
      {
        key: 'report_style',
        label: 'Report style',
        hint: 'How agents write their reports.',
        kind: {
          type: 'choice',
          options: [
            { value: 'concise', label: 'Concise' },
            { value: 'detailed', label: 'Detailed' },
          ],
        },
      },
    ],
  },
  {
    title: 'Agents',
    fields: [
      {
        key: 'max_live_agents',
        label: 'Most live agents',
        hint: 'Empty for no limit.',
        kind: { type: 'number', isOptional: true, unit: '' },
      },
      {
        key: 'max_interns_per_manager',
        label: 'Most interns per manager',
        hint: 'Empty for no limit.',
        kind: { type: 'number', isOptional: true, unit: '' },
      },
      {
        key: 'intern_idle_ttl_minutes',
        label: 'Intern idle time',
        hint: 'An intern idle this long ends.',
        kind: { type: 'number', isOptional: false, unit: 'minutes' },
      },
      {
        key: 'runaway_guard_turns',
        label: 'Runaway guard',
        hint: 'A run pauses and asks you after this many turns.',
        kind: { type: 'number', isOptional: false, unit: 'turns' },
      },
      {
        key: 'context_budget_tokens',
        label: 'Context budget',
        hint: 'A session is summarised once a request passes this, so every turn stays cheap.',
        kind: { type: 'number', isOptional: false, unit: 'tokens' },
      },
    ],
  },
  {
    title: 'Caps',
    fields: [
      {
        key: 'cap_threshold_longest_percent',
        label: 'Threshold of the longest window',
        hint: 'Default threshold of a key’s longest cap window.',
        kind: { type: 'number', isOptional: false, unit: '%' },
      },
      {
        key: 'cap_threshold_shorter_percent',
        label: 'Threshold of shorter windows',
        hint: 'Default threshold of the other windows.',
        kind: { type: 'number', isOptional: false, unit: '%' },
      },
    ],
  },
  {
    title: 'Sandbox',
    fields: [
      {
        key: 'sandbox_timeout_seconds',
        label: 'Command timeout',
        hint: 'A command running longer is stopped.',
        kind: { type: 'number', isOptional: false, unit: 'seconds' },
      },
      {
        key: 'sandbox_cpus',
        label: 'CPUs',
        hint: 'Per container, capped by the server.',
        kind: { type: 'number', isOptional: false, unit: '' },
      },
      {
        key: 'sandbox_memory_mb',
        label: 'Memory',
        hint: 'Per container, capped by the server.',
        kind: { type: 'number', isOptional: false, unit: 'MB' },
      },
      {
        key: 'sandbox_scratch_mb',
        label: 'Scratch space',
        hint: 'Per container, capped by the server.',
        kind: { type: 'number', isOptional: false, unit: 'MB' },
      },
    ],
  },
  {
    title: 'Web',
    fields: [
      {
        key: 'search_cache_ttl_minutes',
        label: 'Search cache',
        hint: 'How long a search result is reused.',
        kind: { type: 'number', isOptional: false, unit: 'minutes' },
      },
      {
        key: 'fetch_cache_ttl_minutes',
        label: 'Page cache',
        hint: 'How long a fetched page is reused.',
        kind: { type: 'number', isOptional: false, unit: 'minutes' },
      },
      {
        key: 'fetch_max_chars',
        label: 'Page length',
        hint: 'The most characters of a page an agent reads.',
        kind: { type: 'number', isOptional: false, unit: 'characters' },
      },
      {
        key: 'disk_alert_percent',
        label: 'Disk alert',
        hint: 'You get a notice when the workspace volume passes it.',
        kind: { type: 'number', isOptional: false, unit: '%' },
      },
    ],
  },
];
