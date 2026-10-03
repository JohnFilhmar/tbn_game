import type { QueryClient } from '@tanstack/react-query';
import type { ChangeEvent, RunSource, TranscriptEntry, WorldPropState } from '@tbn/contracts';
import { collectionKeyOf, queryKeys } from '@/lib/data/collections';

/** Replaces the row with the same id, or adds it at the end. */
export function upsertRow<Row extends { id: string }>(rows: Row[], row: Row): Row[] {
  const index = rows.findIndex((item) => item.id === row.id);
  if (index === -1) return [...rows, row];
  const next = rows.slice();
  next[index] = row;
  return next;
}

/**
 * The prop states with `state` in place of whatever its placement had, so a state saved ahead of
 * the server's answer never doubles up with the answer.
 */
export function withPropState(
  rows: readonly WorldPropState[] | undefined,
  state: WorldPropState,
): WorldPropState[] {
  return [...(rows ?? []).filter((row) => row.placement_id !== state.placement_id), state];
}

/** Removes the row with `id`, keeping the same array when it is not there. */
export function removeRow<Row extends { id: string }>(rows: Row[], id: string): Row[] {
  return rows.some((item) => item.id === id) ? rows.filter((item) => item.id !== id) : rows;
}

function upsertEntry(entries: TranscriptEntry[], entry: TranscriptEntry): TranscriptEntry[] {
  return upsertRow(entries, entry).sort((left, right) => left.seq - right.seq);
}

/**
 * Updates loaded data in place. Data nobody loaded is left to its first fetch; data still loading
 * loads again, as the answer in flight may have been read before this change.
 */
function writeLoaded<Data>(
  client: QueryClient,
  key: readonly unknown[],
  update: (data: Data) => Data,
): void {
  const state = client.getQueryState<Data>(key);
  if (state === undefined) return;
  if (state.data === undefined) {
    if (state.fetchStatus === 'fetching') {
      // A first load is shared, not restarted, by a refetch; cancel it, then load again.
      const filters = { queryKey: key, exact: true };
      void client.cancelQueries(filters).then(() => client.refetchQueries(filters));
    }
    return;
  }
  client.setQueryData<Data>(key, (data) => (data === undefined ? data : update(data)));
}

/** Writes a row into a loaded list, or removes it. */
function writeList<Row extends { id: string }>(
  client: QueryClient,
  key: readonly unknown[],
  id: string,
  row: Row | null,
): void {
  writeLoaded<Row[]>(client, key, (rows) =>
    row === null ? removeRow(rows, id) : upsertRow(rows, row),
  );
}

function removeEverywhere(client: QueryClient, prefix: readonly unknown[], id: string): void {
  for (const [key, rows] of client.getQueriesData<Array<{ id: string }>>({ queryKey: prefix })) {
    if (rows !== undefined && rows.some((row) => row.id === id)) {
      client.setQueryData<Array<{ id: string }>>(key, removeRow(rows, id));
    }
  }
}

/**
 * Writes one change straight into the query cache: a collection gets the row replaced, added or
 * removed; a transcript entry joins its agent's transcript in `seq` order; a provider's cap
 * windows, an agent's attachments and the preferences are replaced whole. Data no screen has
 * loaded yet is left alone, so its first fetch reads it fresh, and data still loading loads again.
 */
export function applyChange(client: QueryClient, event: ChangeEvent): void {
  switch (event.entity) {
    case 'transcript_entry': {
      if (event.data === null) {
        removeEverywhere(client, ['transcript'], event.id);
        return;
      }
      const entry = event.data;
      writeLoaded<TranscriptEntry[]>(client, queryKeys.transcript(entry.agent_id), (entries) =>
        upsertEntry(entries, entry),
      );
      return;
    }
    case 'run_source': {
      if (event.data === null) {
        removeEverywhere(client, ['runSources'], event.id);
        return;
      }
      writeList<RunSource>(client, queryKeys.runSources(event.data.run_id), event.id, event.data);
      return;
    }
    case 'cap_windows':
      client.setQueryData(queryKeys.capWindows(event.id), event.data ?? []);
      return;
    case 'agent_attachments':
      if (event.data !== null)
        client.setQueryData(queryKeys.agentAttachments(event.id), event.data);
      return;
    case 'preferences':
      if (event.data !== null) client.setQueryData(queryKeys.preferences(), event.data);
      return;
    case 'world_layout':
      // A reset leaves only the id behind, so every environment loads its layout again.
      if (event.data === null) void client.invalidateQueries({ queryKey: ['world'] });
      else client.setQueryData(queryKeys.world(event.data.environment), event.data);
      return;
    case 'world_prop_state': {
      const state = event.data;
      if (state !== null) {
        writeLoaded<WorldPropState[]>(client, queryKeys.worldProps(state.environment), (rows) =>
          withPropState(rows, state),
        );
      }
      return;
    }
    default: {
      const key = collectionKeyOf(event.entity);
      if (key === undefined) return;
      const row: { id: string } | null = event.data;
      writeList(client, key, event.id, row);
    }
  }
}

/** Applies a batch of changes in order. */
export function applyChanges(client: QueryClient, events: ChangeEvent[]): void {
  for (const event of events) applyChange(client, event);
}
