import { useQueryClient } from '@tanstack/react-query';
import {
  WorldPropStateSchema,
  type EnvironmentName,
  type SaveWorldPropState,
  type WorldPropState,
} from '@tbn/contracts';
import { useCallback } from 'react';
import { newCommandId } from '@/lib/api/apiClient';
import { withPropState } from '@/lib/realtime/applyChanges';
import { useApi } from '@/providers/SessionProvider';
import { queryKeys } from './collections';

/**
 * Saves one placed prop's whole state. The cache takes the new state at once, so a switch or a
 * radio follows the click, then the server's answer, or goes back when the save fails; other tabs
 * learn of it from the change event.
 */
export function useSavePropState(
  environment: EnvironmentName,
): (placementId: string, body: SaveWorldPropState) => Promise<WorldPropState> {
  const api = useApi();
  const client = useQueryClient();
  return useCallback(
    async (placementId, body) => {
      const key = queryKeys.worldProps(environment);
      const before = client.getQueryData<WorldPropState[]>(key);
      const previous = before?.find((row) => row.placement_id === placementId);
      const optimistic: WorldPropState = {
        id: previous?.id ?? placementId,
        environment,
        placement_id: placementId,
        updated_at: new Date().toISOString(),
        ...body,
      };
      client.setQueryData<WorldPropState[]>(key, (rows) => withPropState(rows, optimistic));
      try {
        const saved = await api.send(
          'PUT',
          `/world/${environment}/props/${placementId}`,
          WorldPropStateSchema,
          { body, commandId: newCommandId() },
        );
        client.setQueryData<WorldPropState[]>(key, (rows) => withPropState(rows, saved));
        return saved;
      } catch (error: unknown) {
        client.setQueryData<WorldPropState[]>(key, (rows) =>
          previous === undefined
            ? (rows ?? []).filter((row) => row.placement_id !== placementId)
            : withPropState(rows, previous),
        );
        throw error;
      }
    },
    [api, client, environment],
  );
}
