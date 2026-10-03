import type { QueryClient } from '@tanstack/react-query';
import type { TranscriptEntry } from '@tbn/contracts';
import { removeRow, upsertRow } from '@/lib/realtime/applyChanges';
import { queryKeys, type CollectionSpec } from './collections';

/** Writes a row a command returned into its collection, before its event arrives. */
export function putRow<Row extends { id: string }>(
  client: QueryClient,
  spec: CollectionSpec<Row>,
  row: Row,
): void {
  client.setQueryData<Row[]>(spec.key, (rows) =>
    rows === undefined ? rows : upsertRow(rows, row),
  );
}

/** Removes a row a command deleted from its collection, before its event arrives. */
export function dropRow<Row extends { id: string }>(
  client: QueryClient,
  spec: CollectionSpec<Row>,
  id: string,
): void {
  client.setQueryData<Row[]>(spec.key, (rows) => (rows === undefined ? rows : removeRow(rows, id)));
}

/** Adds an entry a command returned to its agent's loaded transcript, in `seq` order. */
export function putTranscriptEntry(client: QueryClient, entry: TranscriptEntry): void {
  client.setQueryData<TranscriptEntry[]>(queryKeys.transcript(entry.agent_id), (entries) =>
    entries === undefined
      ? entries
      : upsertRow(entries, entry).sort((left, right) => left.seq - right.seq),
  );
}
