import { useQueryClient } from '@tanstack/react-query';
import type { EnvironmentName, Preferences, WorldPlacement } from '@tbn/contracts';
import { useCallback } from 'react';
import { Vector3 } from 'three';
import { yawTowards } from '@/game/assets/geometry';
import { emitEffect } from '@/game/objects/liveEffects';
import { stateOf, type PropStates } from '@/game/objects/propStates';
import { INTERACTIONS, verbOf } from '@/game/props/interactions';
import { livePositions, OWNER_KEY } from '@/game/world/livePositions';
import { useWorldStore } from '@/game/world/worldStore';
import { errorMessage } from '@/lib/api/apiError';
import { queryKeys } from '@/lib/data/collections';
import { useSavePropState } from '@/lib/data/useSavePropState';
import { useSetPreference } from '@/lib/data/useSetPreference';

/** What E or a HUD button says for a prop: its verb, by its state. */
export function propVerb(placement: WorldPlacement, states: PropStates): string | null {
  const interaction = INTERACTIONS[placement.kind];
  if (interaction === undefined) return null;
  const isClosed = placement.kind === 'blinds' && !stateOf.isOpen(states, placement.id);
  return verbOf(interaction, isClosed);
}

/**
 * Uses a placed prop as the owner: they turn to it and play its clip where they stand, the prop
 * gives off its burst, the narration says so, and the prop does its part: the board opens, the
 * blinds turn, the light panel opens, or the grass counts.
 */
export function useInteract(
  placements: readonly WorldPlacement[],
  states: PropStates,
  environment: EnvironmentName,
): (placementId: string) => void {
  const savePropState = useSavePropState(environment);
  const setPreference = useSetPreference();
  const client = useQueryClient();
  return useCallback(
    (placementId: string) => {
      const placement = placements.find((one) => one.id === placementId);
      const interaction = placement === undefined ? undefined : INTERACTIONS[placement.kind];
      const verb = placement === undefined ? null : propVerb(placement, states);
      if (placement === undefined || interaction === undefined || verb === null) return;
      const store = useWorldStore.getState();
      const at = new Vector3(placement.x, 0, placement.z);
      const owner = livePositions.get(OWNER_KEY);
      store.act(
        interaction.clip,
        owner === undefined ? placement.yaw_deg + 180 : yawTowards(owner, at),
        interaction.seconds,
      );
      store.narrate(`You ${verb}.`);
      if (interaction.effect !== null) emitEffect(interaction.effect, placement.x, placement.z);
      const fail = (error: unknown): void => store.showToast(errorMessage(error));
      switch (interaction.action) {
        case 'draw':
          store.setDrawingOn(placement.id);
          return;
        case 'lights':
          store.setLightsOpen(true);
          return;
        case 'blinds': {
          const isOpen = stateOf.isOpen(states, placement.id);
          savePropState(placement.id, { kind: 'blinds', state: { open: !isOpen } }).catch(fail);
          return;
        }
        case 'grass': {
          const preferences = client.getQueryData<Preferences>(queryKeys.preferences());
          const count = (preferences?.grass_touched ?? 0) + 1;
          // Counted in the cache at once, so a second touch before the answer counts on from it.
          if (preferences !== undefined) {
            client.setQueryData(queryKeys.preferences(), { ...preferences, grass_touched: count });
          }
          store.showToast(`You touched grass. That makes ${count}.`);
          setPreference('grass_touched', count).catch(fail);
          return;
        }
        case 'drink':
          return;
      }
    },
    [placements, states, savePropState, setPreference, client],
  );
}
