function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** An instant as the value of a `datetime-local` input, in this device's time. */
export function localInputOf(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A `datetime-local` value as an ISO instant, null when empty, and the text itself when invalid. */
export function isoOfLocalInput(value: string): string | null {
  if (value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
