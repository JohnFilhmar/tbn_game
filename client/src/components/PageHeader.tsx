import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Props of `PageHeader`. */
export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** The screen's main actions, on the right. */
  actions?: ReactNode;
  /** A link back to the list a detail screen came from. */
  back?: { to: string; label: string };
}

/** The heading of a screen: its one `h1`, what it is for and its actions. */
export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
      {back !== undefined && (
        <Link to={back.to} className="text-sm text-teal-800 hover:underline dark:text-teal-300">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{title}</h1>
          {description !== undefined && (
            <p className="max-w-prose text-sm text-slate-600 dark:text-slate-400">{description}</p>
          )}
        </div>
        {actions !== undefined && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
