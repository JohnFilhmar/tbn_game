import { nominal_ms, shift, window_span, type WindowShape } from './window_math';

const at = (iso: string): Date => new Date(iso);

function fixed(
  length_count: number,
  length_unit: WindowShape['length_unit'],
  anchor: string,
): WindowShape {
  return { length_count, length_unit, reset_mode: 'fixed', anchor_at: at(anchor) };
}

function rolling(length_count: number, length_unit: WindowShape['length_unit']): WindowShape {
  return { length_count, length_unit, reset_mode: 'rolling', anchor_at: null };
}

describe('cap window arithmetic', () => {
  describe('shift', () => {
    it('moves by fixed hours, days and weeks', () => {
      expect(shift(at('2026-03-10T12:00:00Z'), 3, 'hour')).toEqual(at('2026-03-10T15:00:00Z'));
      expect(shift(at('2026-03-10T12:00:00Z'), -2, 'day')).toEqual(at('2026-03-08T12:00:00Z'));
      expect(shift(at('2026-03-10T12:00:00Z'), 1, 'week')).toEqual(at('2026-03-17T12:00:00Z'));
    });

    it('moves by calendar months, clamping to the last day and crossing years', () => {
      expect(shift(at('2026-01-31T08:30:00Z'), 1, 'month')).toEqual(at('2026-02-28T08:30:00Z'));
      expect(shift(at('2028-01-31T08:30:00Z'), 1, 'month')).toEqual(at('2028-02-29T08:30:00Z'));
      expect(shift(at('2026-01-31T08:30:00Z'), 2, 'month')).toEqual(at('2026-03-31T08:30:00Z'));
      expect(shift(at('2026-11-15T00:00:00Z'), 3, 'month')).toEqual(at('2027-02-15T00:00:00Z'));
      expect(shift(at('2026-03-31T00:00:00Z'), -1, 'month')).toEqual(at('2026-02-28T00:00:00Z'));
      expect(shift(at('2026-01-15T00:00:00Z'), -13, 'month')).toEqual(at('2024-12-15T00:00:00Z'));
    });
  });

  describe('rolling windows', () => {
    it('cover the last length up to now and never reset at once', () => {
      const now = at('2026-10-02T10:00:00Z');
      expect(window_span(rolling(1, 'day'), now)).toEqual({
        start: at('2026-10-01T10:00:00Z'),
        after: at('2026-10-01T10:00:00Z'),
        resets_at: null,
      });
      expect(window_span(rolling(2, 'hour'), now).start).toEqual(at('2026-10-02T08:00:00Z'));
      expect(window_span(rolling(1, 'month'), at('2026-03-31T00:00:00Z')).start).toEqual(
        at('2026-02-28T00:00:00Z'),
      );
    });
  });

  describe('fixed windows', () => {
    it('reset at the next step from an anchor in the past', () => {
      const daily = fixed(1, 'day', '2026-01-01T00:00:00Z');
      const span = window_span(daily, at('2026-10-02T10:00:00Z'));
      expect(span.start).toEqual(at('2026-10-02T00:00:00Z'));
      expect(span.resets_at).toEqual(at('2026-10-03T00:00:00Z'));
      expect(span.after).toEqual(at('2026-10-01T23:59:59.999Z'));
    });

    it('start a new window exactly at the boundary', () => {
      const hourly = fixed(6, 'hour', '2026-10-02T00:00:00Z');
      expect(window_span(hourly, at('2026-10-02T12:00:00Z')).start).toEqual(
        at('2026-10-02T12:00:00Z'),
      );
      expect(window_span(hourly, at('2026-10-02T11:59:59.999Z')).start).toEqual(
        at('2026-10-02T06:00:00Z'),
      );
    });

    it('handle an anchor in the future', () => {
      const span = window_span(
        fixed(1, 'hour', '2026-10-02T10:00:05Z'),
        at('2026-10-02T10:00:00Z'),
      );
      expect(span.start).toEqual(at('2026-10-02T09:00:05Z'));
      expect(span.resets_at).toEqual(at('2026-10-02T10:00:05Z'));
    });

    it('step weekly from the anchor', () => {
      const weekly = fixed(1, 'week', '2026-09-07T06:00:00Z');
      const span = window_span(weekly, at('2026-10-02T10:00:00Z'));
      expect(span.start).toEqual(at('2026-09-28T06:00:00Z'));
      expect(span.resets_at).toEqual(at('2026-10-05T06:00:00Z'));
    });

    it('step monthly by calendar months and keep the anchor day', () => {
      const monthly = fixed(1, 'month', '2026-01-31T00:00:00Z');
      const february = window_span(monthly, at('2026-03-10T00:00:00Z'));
      expect(february.start).toEqual(at('2026-02-28T00:00:00Z'));
      expect(february.resets_at).toEqual(at('2026-03-31T00:00:00Z'));
      const april = window_span(monthly, at('2026-04-29T12:00:00Z'));
      expect(april.start).toEqual(at('2026-03-31T00:00:00Z'));
      expect(april.resets_at).toEqual(at('2026-04-30T00:00:00Z'));
      expect(window_span(monthly, at('2026-04-30T00:00:00Z')).start).toEqual(
        at('2026-04-30T00:00:00Z'),
      );
    });

    it('step every few months, and before the anchor', () => {
      const quarterly = fixed(3, 'month', '2026-01-15T00:00:00Z');
      expect(window_span(quarterly, at('2026-05-20T00:00:00Z')).start).toEqual(
        at('2026-04-15T00:00:00Z'),
      );
      expect(window_span(quarterly, at('2025-12-01T00:00:00Z')).start).toEqual(
        at('2025-10-15T00:00:00Z'),
      );
    });
  });

  it('compares lengths with 30-day months', () => {
    expect(nominal_ms({ length_count: 1, length_unit: 'month' })).toBeGreaterThan(
      nominal_ms({ length_count: 4, length_unit: 'week' }),
    );
    expect(nominal_ms({ length_count: 1, length_unit: 'week' })).toBe(
      nominal_ms({ length_count: 7, length_unit: 'day' }),
    );
  });
});
