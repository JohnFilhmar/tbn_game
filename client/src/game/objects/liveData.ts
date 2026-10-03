import type { MergeRequest, Report, Task } from '@tbn/contracts';

/** A milestone of the company, which puts a trophy on the shelf once reached. */
export interface Milestone {
  label: string;
  isReached: boolean;
}

/** What the live objects show of the company: the inbox, the cork board, the rack, the trophies. */
export interface LiveData {
  pendingApprovals: number;
  runningJobs: number;
  /** The latest reports, newest first, pinned on the cork board. */
  pinned: Report[];
  milestones: Milestone[];
}

/** The most reports pinned on a cork board. */
export const MOST_PINNED = 6;

/** The milestones in shelf order: the first merged request, the tenth report, the hundredth task. */
export function milestonesOf(
  mergeRequests: readonly Pick<MergeRequest, 'status'>[],
  reports: readonly unknown[],
  tasks: readonly Pick<Task, 'status'>[],
): Milestone[] {
  return [
    {
      label: 'The first merged request',
      isReached: mergeRequests.some((request) => request.status === 'merged'),
    },
    { label: 'The tenth report', isReached: reports.length >= 10 },
    { label: 'The hundredth task', isReached: tasks.length >= 100 },
  ];
}

/** The latest reports, newest first, at most `count`. */
export function pinnedReports(reports: readonly Report[], count = MOST_PINNED): Report[] {
  return reports.toSorted((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, count);
}

/** A report's card title: its first line of text, without Markdown marks, cut to 60 letters. */
export function cardTitle(report: Pick<Report, 'body_md'>): string {
  const line = report.body_md
    .split('\n')
    .map((text) =>
      text
        .replace(/^[#>*\-\s]+/, '')
        .replace(/[*_`]/g, '')
        .trim(),
    )
    .find((text) => text !== '');
  if (line === undefined) return 'A report';
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

/** The clock hands' turn from twelve, clockwise in radians, at an hour of the day. */
export function clockAngles(hour: number): { hour: number; minute: number } {
  const turn = Math.PI * 2;
  return { hour: ((hour % 12) / 12) * turn, minute: (hour % 1) * turn };
}
