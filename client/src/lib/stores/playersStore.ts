import type { Player } from '@tbn/contracts';
import { create } from 'zustand';

/** A player in the world, and whether they are walking out for good. */
export interface WorldPlayer extends Player {
  /** True once the server says they left long enough ago; they walk out, then disappear. */
  isLeaving: boolean;
}

/** The other people in the owner's world, as the gateway tells them. Positions are never stored. */
export interface PlayersState {
  players: Record<string, WorldPlayer>;
  /** Everyone already there when this client connected. */
  replace: (players: readonly Player[]) => void;
  /** A player moved, came online or went offline. */
  upsert: (player: Player) => void;
  /** A player left long enough ago: they walk out of the building. */
  leave: (id: string) => void;
  /** A player finished walking out. */
  remove: (id: string) => void;
  clear: () => void;
}

/** The players store. */
export const usePlayersStore = create<PlayersState>((set) => ({
  players: {},
  replace: (players) =>
    set({
      players: Object.fromEntries(
        players.map((player) => [player.id, { ...player, isLeaving: false }]),
      ),
    }),
  upsert: (player) =>
    set((state) => ({
      players: { ...state.players, [player.id]: { ...player, isLeaving: false } },
    })),
  leave: (id) =>
    set((state) => {
      const player = state.players[id];
      if (player === undefined) return state;
      return { players: { ...state.players, [id]: { ...player, isLeaving: true } } };
    }),
  remove: (id) =>
    set((state) => ({
      players: Object.fromEntries(
        Object.entries(state.players).filter(([playerId]) => playerId !== id),
      ),
    })),
  clear: () => set({ players: {} }),
}));
