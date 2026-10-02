/** Rows by id, for looking up the agent or task a row points at. */
export function byId<Row extends { id: string }>(
  rows: readonly Row[] | undefined,
): Map<string, Row> {
  return new Map((rows ?? []).map((row) => [row.id, row]));
}

/** A copy sorted by an ISO date field, newest first. */
export function newestFirst<Row>(rows: readonly Row[], date: (row: Row) => string): Row[] {
  return [...rows].sort((left, right) => date(right).localeCompare(date(left)));
}

/** A copy sorted by an ISO date field, oldest first. */
export function oldestFirst<Row>(rows: readonly Row[], date: (row: Row) => string): Row[] {
  return [...rows].sort((left, right) => date(left).localeCompare(date(right)));
}
