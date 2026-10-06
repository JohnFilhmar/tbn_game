import { useQueryClient } from '@tanstack/react-query';
import type { EnvironmentName, Preferences, WorldPlacement } from '@tbn/contracts';
import { useCallback } from 'react';
import { Vector3 } from 'three';
import { vec3, yawTowards } from '@/game/assets/geometry';
import { emitEffect } from '@/game/objects/liveEffects';
import { stateOf, type PropStates } from '@/game/objects/propStates';
import { toWorld } from '@/game/props/arrangement';
import { INTERACTIONS, verbOf } from '@/game/props/interactions';
import { cueSound } from '@/game/sound/soundCues';
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
  const isSet =
    (placement.kind === 'blinds' && !stateOf.isOpen(states, placement.id)) ||
    (placement.kind === 'radio' && stateOf.isRadioOn(states, placement.id));
  return verbOf(interaction, isSet);
}

/** What using a prop asks of the HUD around it. */
export interface InteractHost {
  /** Sits the owner at the computer on a desk screen. */
  openDesk: (path: string) => void;
  /** Opens the world menu, with its time of day. */
  openWorldMenu: () => void;
  /** The owner's name for a guest, who may not change the world's settings; null for the owner. */
  guestOf: string | null;
}

/** What a guest may not do with a prop: change the owner's world or take everyone elsewhere. */
const OWNER_ACTIONS: ReadonlySet<string> = new Set(['travel', 'clock']);

/**
 * Uses a placed prop as the owner: they turn to it and play its clip where they stand, or sit on
 * its seat, the prop gives off its burst, the narration says so, and the prop does its part:
 * the board, the blinds, a panel, a desk screen, the grass count, a watering or the radio.
 */
export function useInteract(
  placements: readonly WorldPlacement[],
  states: PropStates,
  environment: EnvironmentName,
  host: InteractHost,
): (placementId: string) => void {
  const savePropState = useSavePropState(environment);
  const setPreference = useSetPreference();
  const client = useQueryClient();
  const { openDesk, openWorldMenu, guestOf } = host;
  return useCallback(
    (placementId: string) => {
      const placement = placements.find((one) => one.id === placementId);
      const interaction = placement === undefined ? undefined : INTERACTIONS[placement.kind];
      const verb = placement === undefined ? null : propVerb(placement, states);
      if (placement === undefined || interaction === undefined || verb === null) return;
      const store = useWorldStore.getState();
      if (guestOf !== null && OWNER_ACTIONS.has(interaction.action)) {
        store.showToast(`Only ${guestOf} can ${verb} here.`);
        return;
      }
      const fail = (error: unknown): void => store.showToast(errorMessage(error));
      const seatSpot = interaction.action === 'sit' ? interaction.spots[0] : undefined;
      if (seatSpot?.seat !== undefined) {
        store.act(
          interaction.clip,
          placement.yaw_deg + seatSpot.yaw_deg,
          interaction.seconds,
          vec3(toWorld(placement, seatSpot.seat)),
        );
      } else {
        const owner = livePositions.get(OWNER_KEY);
        const at = new Vector3(placement.x, 0, placement.z);
        const yaw = owner === undefined ? placement.yaw_deg + 180 : yawTowards(owner, at);
        store.act(interaction.clip, yaw, interaction.seconds);
      }
      store.narrate(`You ${verb}.`);
      if (interaction.effect !== null) emitEffect(interaction.effect, placement.x, placement.z);
      if (interaction.sound !== null) {
        cueSound(interaction.sound, { x: placement.x, y: 1, z: placement.z });
      }
      switch (interaction.action) {
        case 'draw':
          store.setDrawingOn(placement.id);
          return;
        case 'lights':
          store.setPanel('lights');
          return;
        case 'cork':
          store.setPanel('cork');
          return;
        case 'trophies':
          store.setPanel('trophies');
          return;
        case 'travel':
          store.setPanel('travel');
          return;
        case 'clock':
          openWorldMenu();
          return;
        case 'desk':
          if (interaction.path !== undefined) openDesk(interaction.path);
          return;
        case 'blinds': {
          const isOpen = stateOf.isOpen(states, placement.id);
          savePropState(placement.id, { kind: 'blinds', state: { open: !isOpen } }).catch(fail);
          return;
        }
        case 'radio': {
          const isOn = stateOf.isRadioOn(states, placement.id);
          savePropState(placement.id, { kind: 'radio', state: { on: !isOn } }).catch(fail);
          return;
        }
        case 'water': {
          if (placement.kind !== 'plant' && placement.kind !== 'tree') return;
          const wateredAt = new Date().toISOString();
          savePropState(placement.id, {
            kind: placement.kind,
            state: { watered_at: wateredAt },
          }).catch(fail);
          return;
        }
        case 'grass': {
          // The count is the owner's own preference: a guest's touch is not added to it.
          if (guestOf !== null) {
            store.showToast('You touched grass.');
            return;
          }
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
        case 'sit':
          return;
      }
    },
    [placements, states, savePropState, setPreference, client, openDesk, openWorldMenu, guestOf],
  );
}
