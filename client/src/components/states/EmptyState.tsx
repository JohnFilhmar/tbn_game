import type { ReactNode } from 'react';

/** Props of `EmptyState`. */
export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** The action that fills the screen, such as a link to recruit. */
  action?: ReactNode;
}

/** What a screen shows when it has nothing yet, with the way to change that. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-slate-300 p-6 dark:border-slate-700">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {description !== undefined && (
        <p className="max-w-prose text-sm text-slate-600 dark:text-slate-400">{description}</p>
      )}
      {action}
    </div>
  );
}
