import { useId, useState, type ReactNode } from 'react';
import { cx } from '@/lib/ui/cx';
import { usePage } from '@/lib/ui/usePage';
import { inputClasses } from './fields/Field';
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
  /** The text a row is found by; with it the table gets a search box above it. */
  searchText?: (row: Row) => string;
}

/**
 * A plain, accessible table that scrolls sideways on narrow screens and shows its rows a page at
 * a time, so a long list never scrolls forever. Given `searchText`, a search box narrows the rows
 * to those whose text holds every word typed.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  pageSize = DEFAULT_PAGE_SIZE,
  searchText,
}: DataTableProps<Row>) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const found =
    searchText === undefined || words.length === 0
      ? rows
      : rows.filter((row) => {
          const text = searchText(row).toLowerCase();
          return words.every((word) => text.includes(word));
        });
  const paged = usePage(found, pageSize);
  return (
    <div className="flex flex-col gap-2">
      {searchText !== undefined && (
        <div className="flex flex-col gap-1 sm:max-w-sm">
          <label htmlFor={searchId} className="sr-only">
            Search {caption.toLowerCase()}
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder={`Search ${caption.toLowerCase()}`}
            className={inputClasses(false)}
            onChange={(event) => {
              setQuery(event.target.value);
              paged.first();
            }}
          />
        </div>
      )}
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
            {found.length === 0 && words.length > 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-3 text-slate-600 dark:text-slate-400"
                >
                  Nothing matches &quot;{query.trim()}&quot;.
                </td>
              </tr>
            )}
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
