import { useQueryClient } from '@tanstack/react-query';
import {
  WorldPropStateSchema,
  type EnvironmentName,
  type SaveWorldPropState,
  type WorldPropState,
} from '@tbn/contracts';
import { useCallback } from 'react';
import { newCommandId } from '@/lib/api/apiClient';
import { upsertRow } from '@/lib/realtime/applyChanges';
import { useApi } from '@/providers/SessionProvider';
import { queryKeys } from './collections';

/**
 * Saves one placed prop's whole state and writes the answer into the cache, so the world reacts at
 * once; other tabs learn of it from the change event.
 */
export function useSavePropState(
  environment: EnvironmentName,
): (placementId: string, body: SaveWorldPropState) => Promise<WorldPropState> {
  const api = useApi();
  const client = useQueryClient();
  return useCallback(
    async (placementId, body) => {
      const saved = await api.send(
        'PUT',
        `/world/${environment}/props/${placementId}`,
        WorldPropStateSchema,
        { body, commandId: newCommandId() },
      );
      client.setQueryData<WorldPropState[]>(queryKeys.worldProps(environment), (rows) =>
        upsertRow(rows ?? [], saved),
      );
      return saved;
    },
    [api, client, environment],
  );
}
