import type { ReactNode } from 'react';

/** One fact of a detail list. */
export interface Detail {
  term: string;
  detail: ReactNode;
}

/** Props of `DetailList`. */
export interface DetailListProps {
  items: readonly Detail[];
}

/** Facts about one thing as a description list, two columns on wide screens. */
export function DetailList({ items }: DetailListProps) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.term} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
            {item.term}
          </dt>
          <dd className="text-sm break-words text-slate-900 dark:text-slate-100">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
