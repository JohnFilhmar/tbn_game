/** How a status reads at a glance: the colour of its badge. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** A machine name as words for the owner: `awaiting_approval` reads `Awaiting approval`. */
export function humanize(value: string): string {
  const words = value.replaceAll('_', ' ').trim();
  return words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : words;
}

const TONES: Record<string, Tone> = {
  working: 'info',
  running: 'info',
  in_progress: 'info',
  queued: 'neutral',
  idle: 'neutral',
  pending: 'warning',
  paused: 'warning',
  blocked: 'warning',
  awaiting_approval: 'warning',
  past_threshold: 'warning',
  open: 'info',
  done: 'success',
  sent: 'success',
  merged: 'success',
  approved: 'success',
  approve: 'success',
  ok: 'success',
  failed: 'danger',
  denied: 'danger',
  timed_out: 'danger',
  lost: 'danger',
  at_limit: 'danger',
  request_changes: 'danger',
  cancelled: 'neutral',
  closed: 'neutral',
  dismissed: 'neutral',
  terminated: 'neutral',
};

/** The tone of any status the API sends; an unknown one reads neutral. */
export function toneOf(status: string): Tone {
  return TONES[status] ?? 'neutral';
}
