import { create } from 'zustand';

/** The two camera rigs: behind the owner's character, or straight down from above it. */
export type CameraMode = 'third_person' | 'top_down';

const CAMERA_MODE_KEY = 'tbn_camera_mode';

function loadCameraMode(): CameraMode {
  try {
    return window.localStorage.getItem(CAMERA_MODE_KEY) === 'top_down'
      ? 'top_down'
      : 'third_person';
  } catch {
    return 'third_person';
  }
}

function saveCameraMode(mode: CameraMode): void {
  try {
    window.localStorage.setItem(CAMERA_MODE_KEY, mode);
  } catch {
    // A device that blocks storage starts in third person every time.
  }
}

/** One sentence of what happened in the world. */
export interface NarrationLine {
  id: number;
  text: string;
}

const MOST_LINES = 60;

/** What the HUD shows of the world; the world writes it, React reads it. */
export interface WorldState {
  cameraMode: CameraMode;
  setCameraMode: (mode: CameraMode) => void;
  toggleCamera: () => void;
  /** True once the pack and its navigation mesh are loaded and the characters are placed. */
  isReady: boolean;
  setReady: (isReady: boolean) => void;
  /** True while the owner's character is within the computer's use radius. */
  canUseComputer: boolean;
  setCanUseComputer: (canUse: boolean) => void;
  narration: NarrationLine[];
  narrate: (text: string) => void;
  /** What each agent in the world is doing right now, by agent id. */
  activities: Record<string, string>;
  setActivity: (agentId: string, activity: string) => void;
  dropActivity: (agentId: string) => void;
  /** Frames rendered in the last second. */
  fps: number;
  setFps: (fps: number) => void;
  /** The desk screen the computer opens: the last one the owner had open. */
  lastDesktopPath: string;
  setLastDesktopPath: (path: string) => void;
}

let nextLineId = 1;

/** The world's state for the HUD. */
export const useWorldStore = create<WorldState>((set) => ({
  cameraMode: loadCameraMode(),
  setCameraMode: (mode) => {
    saveCameraMode(mode);
    set({ cameraMode: mode });
  },
  toggleCamera: () =>
    set((state) => {
      const mode = state.cameraMode === 'third_person' ? 'top_down' : 'third_person';
      saveCameraMode(mode);
      return { cameraMode: mode };
    }),
  isReady: false,
  setReady: (isReady) => set({ isReady }),
  canUseComputer: false,
  setCanUseComputer: (canUseComputer) => set({ canUseComputer }),
  narration: [],
  narrate: (text) =>
    set((state) => {
      const line = { id: nextLineId, text };
      nextLineId += 1;
      return { narration: [...state.narration, line].slice(-MOST_LINES) };
    }),
  activities: {},
  setActivity: (agentId, activity) =>
    set((state) =>
      state.activities[agentId] === activity
        ? state
        : { activities: { ...state.activities, [agentId]: activity } },
    ),
  dropActivity: (agentId) =>
    set((state) => {
      if (!(agentId in state.activities)) return state;
      const activities = { ...state.activities };
      delete activities[agentId];
      return { activities };
    }),
  fps: 0,
  setFps: (fps) => set({ fps }),
  lastDesktopPath: '/agents',
  setLastDesktopPath: (lastDesktopPath) => set({ lastDesktopPath }),
}));
