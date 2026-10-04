import type { ReactNode } from 'react';
import { cx } from '@/lib/ui/cx';
import { usePage } from '@/lib/ui/usePage';
import { Pager } from './Pager';

/** How many rows a table shows a page, unless told otherwise. */
export const DEFAULT_PAGE_SIZE = 25;

/** One column of a table: its header and how a row fills its cell. */
export interface Column<Row> {
  header: string;
  cell: (row: Row) => ReactNode;
  className?: string;
  /** Hides the column on narrow screens. */
  isWide?: boolean;
}

/** Props of `DataTable`. */
export interface DataTableProps<Row> {
  /** Read by screen readers as the table's name. */
  caption: string;
  columns: ReadonlyArray<Column<Row>>;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Rows a page; Previous and Next show once there are more. */
  pageSize?: number;
}

/**
 * A plain, accessible table that scrolls sideways on narrow screens and shows its rows a page at
 * a time, so a long list never scrolls forever.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  pageSize = DEFAULT_PAGE_SIZE,
}: DataTableProps<Row>) {
  const paged = usePage(rows, pageSize);
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.header}
                  scope="col"
                  className={cx(
                    'px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300',
                    column.isWide === true && 'hidden md:table-cell',
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
            {paged.rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={cx(
                      'px-3 py-2 align-top text-slate-800 dark:text-slate-200',
                      column.isWide === true && 'hidden md:table-cell',
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        label={`${caption} pages`}
        start={paged.start}
        end={paged.end}
        total={paged.total}
        page={paged.page}
        pages={paged.pages}
        onPrevious={paged.previous}
        onNext={paged.next}
      />
    </div>
  );
}
