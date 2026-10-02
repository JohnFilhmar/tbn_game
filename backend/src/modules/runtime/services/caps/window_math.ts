import type { CapLengthUnit, CapResetMode } from '@tbn/contracts';

/** A cap window's shape, as far as time goes. */
export interface WindowShape {
  length_count: number;
  length_unit: CapLengthUnit;
  reset_mode: CapResetMode;
  anchor_at: Date | null;
}

/** The span a window covers at one instant. */
export interface WindowSpan {
  /** The first instant the window covers. */
  start: Date;
  /** Usage recorded strictly after this instant counts. */
  after: Date;
  /** When a fixed window starts over; null for a rolling window, which never resets at once. */
  resets_at: Date | null;
}

const UNIT_MS: Record<Exclude<CapLengthUnit, 'month'>, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
};

/** A month counts as 30 days when lengths are compared. */
const MONTH_MS = 30 * UNIT_MS.day;

/** A fixed window without an anchor steps from the Unix epoch. */
const EPOCH = new Date(0);

function add_months(date: Date, months: number): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const last_day = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), last_day),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * Moves `date` by `count` lengths of `unit`, backwards for a negative count. Hours, days and weeks
 * are fixed durations; a month step keeps the day of the month, clamped to the month's last day.
 * All arithmetic is in UTC.
 */
export function shift(date: Date, count: number, unit: CapLengthUnit): Date {
  if (unit === 'month') return add_months(date, count);
  return new Date(date.getTime() + count * UNIT_MS[unit]);
}

/** A window's nominal length in milliseconds, with 30-day months, to compare windows. */
export function nominal_ms(window: Pick<WindowShape, 'length_count' | 'length_unit'>): number {
  const unit_ms = window.length_unit === 'month' ? MONTH_MS : UNIT_MS[window.length_unit];
  return window.length_count * unit_ms;
}

function fixed_span(window: WindowShape, now: Date): WindowSpan {
  const anchor = window.anchor_at ?? EPOCH;
  const boundary = (step: number): Date =>
    shift(anchor, step * window.length_count, window.length_unit);
  let step: number;
  if (window.length_unit === 'month') {
    const months =
      (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - anchor.getUTCMonth());
    step = Math.floor(months / window.length_count);
    while (boundary(step) > now) step -= 1;
    while (boundary(step + 1) <= now) step += 1;
  } else {
    step = Math.floor((now.getTime() - anchor.getTime()) / nominal_ms(window));
  }
  const start = boundary(step);
  return { start, after: new Date(start.getTime() - 1), resets_at: boundary(step + 1) };
}

/**
 * The span of a window at `now`. A rolling window covers the last length up to now. A fixed
 * window covers the step from its anchor that contains now, anchors in the future included.
 */
export function window_span(window: WindowShape, now: Date): WindowSpan {
  if (window.reset_mode === 'fixed') return fixed_span(window, now);
  const start = shift(now, -window.length_count, window.length_unit);
  return { start, after: start, resets_at: null };
}
