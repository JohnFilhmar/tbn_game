import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDuration, formatRelative, withReadableTimes } from './time';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');

describe('time formatting', () => {
  it('shows an instant in the owner time zone', () => {
    expect(formatDateTime('2026-10-02T12:05:00.000Z', 'UTC')).toBe('2 Oct 2026, 12:05');
    expect(formatDateTime('2026-10-02T12:05:00.000Z', 'Asia/Tokyo')).toBe('2 Oct 2026, 21:05');
  });

  it('says how long ago or ahead, in the largest whole unit', () => {
    expect(formatRelative('2026-10-02T11:59:58.000Z', NOW)).toBe('just now');
    expect(formatRelative('2026-10-02T11:59:30.000Z', NOW)).toBe('30 seconds ago');
    expect(formatRelative('2026-10-02T11:55:00.000Z', NOW)).toBe('5 minutes ago');
    expect(formatRelative('2026-10-02T14:00:00.000Z', NOW)).toBe('in 2 hours');
    expect(formatRelative('2026-10-01T12:00:00.000Z', NOW)).toBe('yesterday');
  });

  it('writes the UTC instants in a server sentence for a person', () => {
    expect(
      withReadableTimes(
        'Open Router AI hit its rate limit. Resumes at 2026-10-02T14:00:00.000Z.',
        'Asia/Manila',
        NOW,
      ),
    ).toBe('Open Router AI hit its rate limit. Resumes at 2 Oct 2026, 22:00 (in 2 hours).');
    expect(withReadableTimes('Waiting for 2 subtasks.', 'UTC', NOW)).toBe(
      'Waiting for 2 subtasks.',
    );
  });

  it('measures a duration, up to now while it is still going', () => {
    expect(formatDuration('2026-10-02T11:59:55.000Z', '2026-10-02T12:00:00.000Z')).toBe('5 s');
    expect(formatDuration('2026-10-02T11:57:55.000Z', null, NOW)).toBe('2 min 5 s');
    expect(formatDuration('2026-10-02T09:30:00.000Z', null, NOW)).toBe('2 h 30 min');
  });
});
