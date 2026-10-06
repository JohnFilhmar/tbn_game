import { create } from 'zustand';

/** A message from another player that has not been opened yet. */
export interface MessageNotice {
  fromId: string;
  fromName: string;
  text: string;
}

/** What the HUD shows of the other players; the world writes it, React reads it. */
export interface PlayerUiState {
  /** The player within reach in front of you, whom E talks to; null when none. */
  nearPlayerId: string | null;
  setNearPlayerId: (playerId: string | null) => void;
  /** The player whose conversation is open, or null. A moment in the world, never a route. */
  chatWith: string | null;
  setChatWith: (playerId: string | null) => void;
  /** Bumped to put your character back at the spawn point, the way out when stuck. */
  unstuckId: number;
  unstuck: () => void;
  /** Messages that arrived outside their conversation, newest last, one per sender. */
  notices: MessageNotice[];
  notify: (notice: MessageNotice) => void;
  dismiss: (fromId: string) => void;
}

/** The store of the other players' HUD state. */
export const usePlayerUiStore = create<PlayerUiState>((set) => ({
  nearPlayerId: null,
  setNearPlayerId: (nearPlayerId) => set({ nearPlayerId }),
  chatWith: null,
  setChatWith: (chatWith) =>
    set((state) => ({
      chatWith,
      notices:
        chatWith === null
          ? state.notices
          : state.notices.filter((notice) => notice.fromId !== chatWith),
    })),
  unstuckId: 0,
  unstuck: () => set((state) => ({ unstuckId: state.unstuckId + 1 })),
  notices: [],
  notify: (notice) =>
    set((state) => ({
      notices: [...state.notices.filter((one) => one.fromId !== notice.fromId), notice],
    })),
  dismiss: (fromId) =>
    set((state) => ({ notices: state.notices.filter((notice) => notice.fromId !== fromId) })),
}));
