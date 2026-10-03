import type { EnvironmentName, WorldPlacement } from '@tbn/contracts';
import { Vector3 } from 'three';
import { create } from 'zustand';
import { commit, historyOf, redo, undo, type Draft, type History } from './draft';

/** Build mode's state: the draft and its history, what is selected and what is held. */
export interface BuildState {
  /** The environment being built, or null outside build mode. */
  environment: EnvironmentName | null;
  history: History | null;
  /** The revision the draft started from, which a save goes over. */
  baseRevision: number;
  /** The draft as last saved, to tell whether there is anything to save. */
  saved: Draft | null;
  selectedId: string | null;
  /** A prop following the pointer, new from the catalog or picked up to move. */
  holding: WorldPlacement | null;
  /** Where the camera looks while building; the movement keys pan it. */
  focus: Vector3;
  open: (environment: EnvironmentName, draft: Draft, revision: number, focus: Vector3) => void;
  close: () => void;
  change: (next: (draft: Draft) => Draft) => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  hold: (placement: WorldPlacement | null) => void;
  /** Records a save: the draft is now what the server holds, at `revision`. */
  markSaved: (draft: Draft, revision: number) => void;
}

/** Build mode, a world sub-mode like a conversation: never a route. */
export const useBuildStore = create<BuildState>((set) => ({
  environment: null,
  history: null,
  baseRevision: 0,
  saved: null,
  selectedId: null,
  holding: null,
  focus: new Vector3(),
  open: (environment, draft, revision, focus) =>
    set({
      environment,
      history: historyOf(draft),
      baseRevision: revision,
      saved: draft,
      selectedId: null,
      holding: null,
      focus: focus.clone(),
    }),
  close: () =>
    set({ environment: null, history: null, saved: null, selectedId: null, holding: null }),
  change: (next) =>
    set((state) =>
      state.history === null
        ? state
        : { history: commit(state.history, next(state.history.present)) },
    ),
  undo: () =>
    set((state) =>
      state.history === null ? state : { history: undo(state.history), selectedId: null },
    ),
  redo: () =>
    set((state) =>
      state.history === null ? state : { history: redo(state.history), selectedId: null },
    ),
  select: (selectedId) => set({ selectedId }),
  hold: (holding) => set({ holding, selectedId: null }),
  markSaved: (draft, revision) => set({ saved: draft, baseRevision: revision }),
}));

/** True while a draft differs from what was last saved. */
export function hasUnsavedChanges(state: Pick<BuildState, 'history' | 'saved'>): boolean {
  return state.history !== null && state.history.present !== state.saved;
}
