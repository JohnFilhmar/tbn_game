import { useState } from 'react';

/** The rows of one page: which page it is, how many there are, and the slice it shows. */
export interface PageWindow {
  page: number;
  pages: number;
  start: number;
  end: number;
}

/**
 * Page `page` (from 0) of `total` rows `size` at a time, moved back onto the last page when the
 * rows shrank under it.
 */
export function pageWindow(total: number, page: number, size: number): PageWindow {
  const pages = Math.max(1, Math.ceil(total / size));
  const shown = Math.min(Math.max(0, page), pages - 1);
  const start = shown * size;
  return { page: shown, pages, start, end: Math.min(total, start + size) };
}

/** A page of `rows`, `size` at a time, and the moves between pages. */
export function usePage<Row>(rows: readonly Row[], size: number) {
  const [page, setPage] = useState(0);
  const current = pageWindow(rows.length, page, size);
  return {
    ...current,
    total: rows.length,
    rows: rows.slice(current.start, current.end),
    previous: () => setPage(Math.max(0, current.page - 1)),
    next: () => setPage(Math.min(current.pages - 1, current.page + 1)),
  };
}
