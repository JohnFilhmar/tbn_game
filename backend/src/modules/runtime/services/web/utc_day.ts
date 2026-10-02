/** Midnight UTC of the day `at` falls on, the key of the daily cache counters. */
export function utc_day(at = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}
