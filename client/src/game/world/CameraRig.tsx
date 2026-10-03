import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { PerspectiveCamera, Vector3, type Object3D } from 'three';
import { radiansOf } from '@/game/assets/geometry';
import { livePositions } from './livePositions';
import { prefersReducedMotion } from './motion';
import type { SeatPose } from './seat';
import type { CameraMode } from './worldStore';

/** Props of `CameraRig`. */
export interface CameraRigProps {
  /** What the camera follows: the owner's character. */
  targetRef: RefObject<Object3D | null>;
  mode: CameraMode;
  ceiling: number;
  /** The way the character faces at first, so the camera starts behind it. */
  initialYawDeg: number;
  /** Written every frame: the yaw the movement keys treat as forward. */
  viewYawRef: RefObject<number>;
  /** The pose at the monitor while the owner is seated, or null in the world. */
  seatPose: SeatPose | null;
  /** The agent the owner is talking to: the camera leans in over the shoulder onto it. */
  talkingTo: string | null;
}

const DEG = Math.PI / 180;
/** Third person looks from behind the right shoulder, at head height, as GTA San Andreas does. */
const FOCUS_HEIGHT = 1.55;
const SHOULDER = 0.45;
/** How fast the camera follows: briskly while walking, slower while it glides to or from the
 * seat, so sitting down and standing up read as one move. */
const FOLLOW_RATE = 10;
const GLIDE_RATE = 4;
const GLIDE_SECONDS = 1.5;
/**
 * The conversation pose: behind and right of the owner's head, looking just right of the agent's,
 * so the owner's shoulder and the agent share the part of the screen the panel leaves free.
 */
const TALK_BACK = 1;
const TALK_SIDE = 0.75;
const TALK_LIFT = 0.05;
const LOOK_SHIFT = 0.45;
const AGENT_HEAD = 1.5;
const FOV = 50;
const TALK_FOV = 42;
const UP = new Vector3(0, 1, 0);
const NORTH_UP = new Vector3(0, 0, -1);

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The camera rigs. Third person sits close behind the character's right shoulder: drag to look
 * around, wheel to zoom out.
 * Top down looks straight down from above the character with north up: wheel to zoom. Seated looks
 * at the monitor from the owner's chair. A change between them glides; the first frame and a
 * device that asks for reduced motion snap. The movement keys stay relative to what is on screen.
 */
export function CameraRig({
  targetRef,
  mode,
  ceiling,
  initialYawDeg,
  viewYawRef,
  seatPose,
  talkingTo,
}: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const element = useThree((state) => state.gl.domElement);
  const orbit = useRef({
    yaw: radiansOf(initialYawDeg + 180),
    pitch: 0.2,
    distance: 3.2,
    height: Math.max(ceiling + 10, 18),
  });
  const focus = useMemo(() => new Vector3(), []);
  const desired = useMemo(() => new Vector3(), []);
  const look = useMemo(() => new Vector3(), []);
  const glide = useRef({ isFirstFrame: true, until: 0 });
  const isSeated = seatPose !== null;

  useEffect(() => {
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      isDragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      element.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!isDragging || mode !== 'third_person') return;
      const state = orbit.current;
      state.yaw -= (event.clientX - lastX) * 0.006;
      state.pitch = clamp(state.pitch + (event.clientY - lastY) * 0.004, -0.1, 1.1);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent): void => {
      isDragging = false;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const factor = Math.exp(event.deltaY * 0.0012);
      const state = orbit.current;
      if (mode === 'third_person') state.distance = clamp(state.distance * factor, 1.4, 7);
      else state.height = clamp(state.height * factor, ceiling + 4, 60);
    };
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      element.removeEventListener('wheel', onWheel);
    };
  }, [element, mode, ceiling]);

  useEffect(() => {
    glide.current.until = performance.now() / 1000 + GLIDE_SECONDS;
  }, [isSeated, talkingTo]);

  useFrame((frame, delta) => {
    const target = targetRef.current;
    const state = orbit.current;
    let up = UP;
    let fov = FOV;
    const partner = talkingTo === null ? undefined : livePositions.get(talkingTo);
    if (seatPose !== null) {
      desired.copy(seatPose.eye);
      focus.copy(seatPose.look);
    } else if (target === null) {
      return;
    } else if (partner !== undefined) {
      // Over the owner's right shoulder, onto the agent's face.
      const dx = partner.x - target.position.x;
      const dz = partner.z - target.position.z;
      const length = Math.hypot(dx, dz) || 1;
      const forwardX = dx / length;
      const forwardZ = dz / length;
      desired.set(
        target.position.x - forwardX * TALK_BACK - forwardZ * TALK_SIDE,
        target.position.y + FOCUS_HEIGHT + TALK_LIFT,
        target.position.z - forwardZ * TALK_BACK + forwardX * TALK_SIDE,
      );
      focus.set(partner.x - forwardZ * LOOK_SHIFT, AGENT_HEAD, partner.z + forwardX * LOOK_SHIFT);
      fov = TALK_FOV;
    } else if (mode === 'third_person') {
      // The right of the view, so the character stands left of the middle of the screen.
      focus.set(
        target.position.x + Math.cos(state.yaw) * SHOULDER,
        target.position.y + FOCUS_HEIGHT,
        target.position.z - Math.sin(state.yaw) * SHOULDER,
      );
      const flat = Math.cos(state.pitch) * state.distance;
      desired.set(
        focus.x + Math.sin(state.yaw) * flat,
        focus.y + Math.sin(state.pitch) * state.distance,
        focus.z + Math.cos(state.yaw) * flat,
      );
      viewYawRef.current = state.yaw / DEG + 180;
    } else {
      focus.set(target.position.x, 0, target.position.z);
      desired.set(focus.x, state.height, focus.z);
      up = NORTH_UP;
      viewYawRef.current = 180;
    }
    const own = glide.current;
    const rate = performance.now() / 1000 < own.until ? GLIDE_RATE : FOLLOW_RATE;
    const ease =
      own.isFirstFrame || prefersReducedMotion() ? 1 : 1 - Math.exp(-rate * Math.min(delta, 0.1));
    own.isFirstFrame = false;
    camera.position.lerp(desired, ease);
    look.lerp(focus, ease);
    camera.up.lerp(up, ease).normalize();
    camera.lookAt(look);
    const lens = frame.camera;
    if (lens instanceof PerspectiveCamera && Math.abs(lens.fov - fov) > 0.01) {
      lens.fov += (fov - lens.fov) * ease;
      lens.updateProjectionMatrix();
    }
  });

  return null;
}
