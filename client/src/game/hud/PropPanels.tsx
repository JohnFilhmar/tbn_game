import type { EnvironmentName, Report } from '@tbn/contracts';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { TimeStamp } from '@/components/TimeStamp';
import { PACKS } from '@/game/assets/packs';
import { cardTitle, type Milestone } from '@/game/objects/liveData';

/** Props of `CorkDialog`. */
export interface CorkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The pinned reports, newest first. */
  reports: readonly Report[];
  /** Opens a report at the computer. */
  onRead: (reportId: string) => void;
}

/** The cork board's pinned cards: the latest reports, each opening at the computer. */
export function CorkDialog({ isOpen, onClose, reports, onRead }: CorkDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Cork board"
      description="The latest reports, pinned up."
    >
      {reports.length === 0 ? (
        <p className="text-sm">Nothing is pinned yet. A finished task pins its report here.</p>
      ) : (
        <ul aria-label="Pinned reports" className="flex flex-col gap-2">
          {reports.map((report) => (
            <li key={report.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{cardTitle(report)}</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  <TimeStamp iso={report.created_at} />
                </span>
              </span>
              <Button size="sm" onClick={() => onRead(report.id)}>
                Read
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** Props of `TrophyDialog`. */
export interface TrophyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  milestones: readonly Milestone[];
}

/** The trophy shelf: each milestone, and whether its trophy is on the shelf yet. */
export function TrophyDialog({ isOpen, onClose, milestones }: TrophyDialogProps) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Trophy shelf">
      <ul aria-label="Milestones" className="flex flex-col gap-2 text-sm">
        {milestones.map((milestone) => (
          <li key={milestone.label} className="flex items-center justify-between gap-3">
            <span>{milestone.label}</span>
            <span
              className={
                milestone.isReached ? 'font-semibold text-teal-700 dark:text-teal-300' : ''
              }
            >
              {milestone.isReached ? 'Won' : 'Not yet'}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Props of `TravelDialog`. */
export interface TravelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The environment the owner is in, which is not offered. */
  current: EnvironmentName;
  onTravel: (environment: EnvironmentName) => void;
}

/** The exit sign's choice: the other environments, each a step through the door. */
export function TravelDialog({ isOpen, onClose, current, onTravel }: TravelDialogProps) {
  const others = Object.values(PACKS).filter((pack) => pack.manifest.name !== current);
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Where to?">
      <div className="flex flex-wrap gap-2">
        {others.map((pack) => (
          <Button key={pack.manifest.name} onClick={() => onTravel(pack.manifest.name)}>
            Go to the {pack.manifest.title.toLowerCase()}
          </Button>
        ))}
      </div>
    </Dialog>
  );
}
