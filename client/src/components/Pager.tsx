import { Button } from './Button';

/** Props of `Pager`. */
export interface PagerProps {
  /** Names what is paged, for screen readers: "Agents pages". */
  label: string;
  /** The first and last row shown, from 0 and exclusive, and how many rows there are. */
  start: number;
  end: number;
  total: number;
  page: number;
  pages: number;
  onPrevious: () => void;
  onNext: () => void;
}

/** Previous and Next under a paged list, with which rows show; nothing when one page holds all. */
export function Pager({ label, start, end, total, page, pages, onPrevious, onNext }: PagerProps) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 text-sm">
      <p className="text-slate-600 dark:text-slate-400" aria-live="polite">
        {start + 1} to {end} of {total}
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onPrevious} disabled={page === 0}>
          Previous
        </Button>
        <Button size="sm" onClick={onNext} disabled={page >= pages - 1}>
          Next
        </Button>
      </div>
    </nav>
  );
}
