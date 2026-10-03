import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Vector3, type Object3D } from 'three';
import { radiansOf } from '@/game/assets/geometry';
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
}

const DEG = Math.PI / 180;
const FOCUS_HEIGHT = 1.2;
/** How fast the camera follows: briskly while walking, slower while it glides to or from the
 * seat, so sitting down and standing up read as one move. */
const FOLLOW_RATE = 10;
const GLIDE_RATE = 4;
const GLIDE_SECONDS = 1.5;
const UP = new Vector3(0, 1, 0);
const NORTH_UP = new Vector3(0, 0, -1);

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The camera rigs. Third person orbits behind the character: drag to look around, wheel to zoom.
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
}: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const element = useThree((state) => state.gl.domElement);
  const orbit = useRef({
    yaw: radiansOf(initialYawDeg + 180),
    pitch: 0.45,
    distance: 6,
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
      state.pitch = clamp(state.pitch + (event.clientY - lastY) * 0.004, 0.08, 1.3);
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
      if (mode === 'third_person') state.distance = clamp(state.distance * factor, 2, 14);
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
  }, [isSeated]);

  useFrame((_, delta) => {
    const target = targetRef.current;
    const state = orbit.current;
    let up = UP;
    if (seatPose !== null) {
      desired.copy(seatPose.eye);
      focus.copy(seatPose.look);
    } else if (target === null) {
      return;
    } else if (mode === 'third_person') {
      focus.set(target.position.x, target.position.y + FOCUS_HEIGHT, target.position.z);
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
  });

  return null;
}
