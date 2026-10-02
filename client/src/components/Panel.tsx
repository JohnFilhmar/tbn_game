import { useId, type ReactNode } from 'react';
import { cx } from '@/lib/ui/cx';

/** Props of `Panel`. */
export interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A titled section of a screen, a card in the desktop. */
export function Panel({ title, description, actions, className, children }: PanelProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={title === undefined ? undefined : titleId}
      className={cx(
        'flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      {(title !== undefined || actions !== undefined) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {title !== undefined && (
              <h2
                id={titleId}
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                {title}
              </h2>
            )}
            {description !== undefined && (
              <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
            )}
          </div>
          {actions !== undefined && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
