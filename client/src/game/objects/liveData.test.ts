import type { Report } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { cardTitle, clockAngles, milestonesOf, pinnedReports } from './liveData';

function report(day: number, bodyMd = `# Report ${day}`): Report {
  return {
    id: `00000000-0000-4000-8000-${day.toString().padStart(12, '0')}`,
    task_id: '00000000-0000-4000-8000-000000000001',
    agent_id: '00000000-0000-4000-8000-000000000002',
    body_md: bodyMd,
    created_at: `2026-09-${day.toString().padStart(2, '0')}T10:00:00.000Z`,
  };
}

describe('the live objects', () => {
  it('reach a milestone at the first merge, the tenth report and the hundredth task', () => {
    const reached = (merged: number, reports: number, tasks: number) =>
      milestonesOf(
        Array.from({ length: merged }, () => ({ status: 'merged' as const })),
        Array.from({ length: reports }),
        Array.from({ length: tasks }, () => ({ status: 'done' as const })),
      ).map((one) => one.isReached);
    expect(reached(0, 9, 99)).toEqual([false, false, false]);
    expect(reached(1, 10, 100)).toEqual([true, true, true]);
    expect(milestonesOf([{ status: 'open' }], [], [])[0]?.isReached).toBe(false);
  });

  it('pin the six latest reports, newest first, under their first line', () => {
    const reports = [3, 9, 1, 7, 5, 8, 2].map((day) => report(day));
    expect(pinnedReports(reports).map((one) => one.created_at.slice(8, 10))).toEqual([
      '09',
      '08',
      '07',
      '05',
      '03',
      '02',
    ]);
    expect(cardTitle(report(1, '\n\n## **Tea** guide for `ops`\nmore'))).toBe('Tea guide for ops');
    expect(cardTitle(report(1, '   '))).toBe('A report');
    expect(cardTitle(report(1, 'x'.repeat(80)))).toHaveLength(60);
  });

  it('turn the clock hands with the hour', () => {
    expect(clockAngles(0)).toEqual({ hour: 0, minute: 0 });
    expect(clockAngles(15.5).hour).toBeCloseTo(Math.PI * 0.5 + Math.PI / 12);
    expect(clockAngles(15.5).minute).toBeCloseTo(Math.PI);
  });
});
