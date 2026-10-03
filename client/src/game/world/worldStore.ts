import { EnvironmentNameSchema, type EnvironmentName } from '@tbn/contracts';
import type { Vector3 } from 'three';
import type { ClipName } from '@/game/assets/clipNames';
import { create } from 'zustand';
import { prefersReducedMotion } from './motion';

/** The two camera rigs: behind the owner's character, or straight down from above it. */
export type CameraMode = 'third_person' | 'top_down';

const CAMERA_MODE_KEY = 'tbn_camera_mode';
const ENVIRONMENT_KEY = 'tbn_environment';
/** How long the screen stays dark on each side of a teleport. */
const FADE_MS = 180;

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

/** The pack the owner last used on this device, which the world shows before sign in. */
function loadEnvironment(): EnvironmentName {
  try {
    const parsed = EnvironmentNameSchema.safeParse(window.localStorage.getItem(ENVIRONMENT_KEY));
    return parsed.success ? parsed.data : 'office';
  } catch {
    return 'office';
  }
}

function saveEnvironment(environment: EnvironmentName): void {
  try {
    window.localStorage.setItem(ENVIRONMENT_KEY, environment);
  } catch {
    // A device that blocks storage shows the office before sign in.
  }
}

/** A request to move the owner's character at once; the character takes it on its next frame. */
export interface TeleportRequest {
  id: number;
  position: Vector3;
  yawDeg: number;
}

/** The owner using a prop: the clip they play, the way they face, and when it ends. */
export interface Acting {
  clip: ClipName;
  yawDeg: number;
  /** Seconds on `performance.now()`'s clock. */
  until: number;
  /** Where the owner sits for the clip, on a sofa or a beanbag; null where they stand. */
  seat: Vector3 | null;
}

/** A panel a prop opens over the world. */
export type PropPanel = 'lights' | 'cork' | 'trophies' | 'travel';

/** A short message over the world that fades on its own. */
export interface Toast {
  id: number;
  text: string;
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
  /** The pack of the owner's preference, kept on the device for the world before sign in. */
  environment: EnvironmentName;
  setEnvironment: (environment: EnvironmentName) => void;
  /** True for the moment the camera glides between the world and the seat. */
  isGliding: boolean;
  setGliding: (isGliding: boolean) => void;
  /** True while the screen is dark around a teleport. */
  isFaded: boolean;
  /** Darkens the screen, runs `action`, and lightens it again; at once under reduced motion. */
  fadeThrough: (action: () => void) => void;
  teleport: TeleportRequest | null;
  requestTeleport: (position: Vector3, yawDeg: number) => void;
  /** The frame counter, shown with F3. */
  isFpsShown: boolean;
  toggleFps: () => void;
  /** The agent within the owner's reach and in front of them, whom E talks to; null when none. */
  nearAgentId: string | null;
  setNearAgentId: (agentId: string | null) => void;
  /** The agent the owner is talking to, or null. A moment in the world, never a route. */
  talkingTo: string | null;
  setTalkingTo: (agentId: string | null) => void;
  /** The prop E uses, when it is the nearest thing in front of the owner; null when none. */
  nearPropId: string | null;
  /** Every prop within reach of the owner, nearest first, which the HUD lists as buttons. */
  reachablePropIds: readonly string[];
  setNearProps: (nearPropId: string | null, reachablePropIds: readonly string[]) => void;
  /** The owner using a prop, or null. */
  acting: Acting | null;
  act: (clip: ClipName, yawDeg: number, seconds: number, seat?: Vector3 | null) => void;
  stopActing: () => void;
  /** The whiteboard the owner draws on, or null. A moment in the world, never a route. */
  drawingOn: string | null;
  setDrawingOn: (placementId: string | null) => void;
  /** The panel a prop opened, or null. */
  panel: PropPanel | null;
  setPanel: (panel: PropPanel | null) => void;
  /** True once the owner sat at the computer and until they stand up in the world, so a
   * character that first appears then starts beside the chair. */
  hasSat: boolean;
  setHasSat: (hasSat: boolean) => void;
  toast: Toast | null;
  showToast: (text: string) => void;
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
  environment: loadEnvironment(),
  setEnvironment: (environment) => {
    saveEnvironment(environment);
    set({ environment });
  },
  isGliding: false,
  setGliding: (isGliding) => set({ isGliding }),
  isFaded: false,
  fadeThrough: (action) => {
    if (prefersReducedMotion()) {
      action();
      return;
    }
    set({ isFaded: true });
    window.setTimeout(() => {
      action();
      set({ isFaded: false });
    }, FADE_MS);
  },
  teleport: null,
  requestTeleport: (position, yawDeg) =>
    set((state) => ({
      teleport: { id: (state.teleport?.id ?? 0) + 1, position, yawDeg },
    })),
  isFpsShown: false,
  toggleFps: () => set((state) => ({ isFpsShown: !state.isFpsShown })),
  nearAgentId: null,
  setNearAgentId: (nearAgentId) => set({ nearAgentId }),
  talkingTo: null,
  setTalkingTo: (talkingTo) => set({ talkingTo }),
  nearPropId: null,
  reachablePropIds: [],
  setNearProps: (nearPropId, reachablePropIds) => set({ nearPropId, reachablePropIds }),
  acting: null,
  act: (clip, yawDeg, seconds, seat = null) =>
    set({ acting: { clip, yawDeg, until: performance.now() / 1000 + seconds, seat } }),
  stopActing: () => set({ acting: null }),
  drawingOn: null,
  setDrawingOn: (drawingOn) => set({ drawingOn }),
  panel: null,
  setPanel: (panel) => set({ panel }),
  hasSat: false,
  setHasSat: (hasSat) => set({ hasSat }),
  toast: null,
  showToast: (text) => set((state) => ({ toast: { id: (state.toast?.id ?? 0) + 1, text } })),
}));
