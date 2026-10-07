/** A date and time in the owner's time zone, such as `3 Oct 2026, 14:05`. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** How long ago or how far ahead an instant is, such as `5 minutes ago` or `in 2 hours`. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1_000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit);
  }
  return Math.abs(seconds) < 10 ? 'just now' : format.format(seconds, 'second');
}

const ISO_INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/**
 * A sentence from the server with every UTC instant in it written for a person, such as
 * `Retrying at 7 Oct 2026, 20:05 (in 3 minutes).`
 */
export function withReadableTimes(text: string, timeZone: string, now = Date.now()): string {
  return text.replace(
    ISO_INSTANT,
    (iso) => `${formatDateTime(iso, timeZone)} (${formatRelative(iso, now)})`,
  );
}

/** The time between two instants, such as `2 min 5 s`; up to now when the end is null. */
export function formatDuration(startIso: string, endIso: string | null, now = Date.now()): string {
  const end = endIso === null ? now : new Date(endIso).getTime();
  const total = Math.max(0, Math.round((end - new Date(startIso).getTime()) / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}
