import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Vector3, type Group } from 'three';
import type { ResolvedAppearance } from '@/game/assets/appearance';
import type { ClipName } from '@/game/assets/characterManifest';
import { distanceXz, forwardOf, radiansOf, turnTowards, vec3 } from '@/game/assets/geometry';
import type { Anchor, ComputerAnchor } from '@/game/assets/packManifest';
import { WALK_SPEED } from '@/game/npcs/agentActor';
import { Character } from './Character';
import type { MoveAction } from './keyboard';
import { livePositions, OWNER_KEY } from './livePositions';
import type { Navigation, NavNode } from './navmesh';
import type { SeatPose } from './seat';
import { useWorldStore } from './worldStore';

/** Props of `OwnerCharacter`. */
export interface OwnerCharacterProps {
  navigation: Navigation;
  spawn: Anchor;
  computer: ComputerAnchor;
  appearance: ResolvedAppearance;
  keysRef: RefObject<Set<MoveAction>>;
  /** The yaw the keys treat as forward, written by the camera rig. */
  viewYawRef: RefObject<number>;
  groupRef: RefObject<Group | null>;
  /** The chair while the owner is seated at the computer, or null in the world. */
  seatPose: SeatPose | null;
}

/** What the character keeps between frames. */
interface OwnerState {
  position: Vector3;
  yawDeg: number;
  /** The navigation polygon of the last step, for the next clamp. */
  node: NavNode | null;
  isNearComputer: boolean;
  wasSeated: boolean;
  /** The last teleport request taken. */
  teleportId: number;
}

const OWNER_WALK = 1.6;
const OWNER_RUN = 3.6;
const TURN_SPEED = 600;
const DEG = Math.PI / 180;
/** Closer than this, the camera is inside the seated character, which then hides. */
const HIDE_WITHIN = 1;
const HEAD_HEIGHT = 1.2;

/**
 * The owner's character: moved by the keys relative to the view, kept on the navigation mesh by
 * clamping every step, and watched for being within reach of the computer. Seated, it works in
 * the chair; standing up puts it on the floor beside the chair. A teleport request moves it at
 * once, snapped to the floor.
 */
export function OwnerCharacter({
  navigation,
  spawn,
  computer,
  appearance,
  keysRef,
  viewYawRef,
  groupRef,
  seatPose,
}: OwnerCharacterProps) {
  const setCanUseComputer = useWorldStore((state) => state.setCanUseComputer);
  const state = useRef<OwnerState>({
    position: vec3(spawn.position),
    yawDeg: spawn.yaw_deg,
    node: null,
    isNearComputer: false,
    wasSeated: false,
    teleportId: useWorldStore.getState().teleport?.id ?? 0,
  });
  const clipRef = useRef<ClipName>('idle');
  const timeScaleRef = useRef(1);
  const proposed = useMemo(() => new Vector3(), []);
  const clamped = useMemo(() => new Vector3(), []);
  const computerPosition = useMemo(() => vec3(computer.position), [computer]);
  const head = useMemo(() => new Vector3(), []);

  useEffect(() => {
    livePositions.set(OWNER_KEY, state.current.position);
    return () => {
      livePositions.delete(OWNER_KEY);
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const group = groupRef.current;
    if (group === null) return;
    const own = state.current;
    if (seatPose !== null) {
      own.position.copy(seatPose.chair);
      own.yawDeg = seatPose.yawDeg;
      own.node = null;
      own.wasSeated = true;
      group.position.copy(own.position);
      group.rotation.y = radiansOf(own.yawDeg);
      clipRef.current = 'work';
      head.set(own.position.x, HEAD_HEIGHT, own.position.z);
      group.visible = camera.position.distanceTo(head) > HIDE_WITHIN;
      return;
    }
    group.visible = true;
    if (own.wasSeated) {
      own.wasSeated = false;
      own.node = navigation.clampStep(navigation.snap(own.position), own.position, null, clamped);
      own.position.set(clamped.x, 0, clamped.z);
    }
    const teleport = useWorldStore.getState().teleport;
    if (teleport !== null && teleport.id !== own.teleportId) {
      own.teleportId = teleport.id;
      const start = navigation.snap(teleport.position);
      own.node = navigation.clampStep(start, teleport.position, null, clamped);
      own.position.set(clamped.x, 0, clamped.z);
      own.yawDeg = teleport.yawDeg;
    }
    const keys = keysRef.current;
    const dt = Math.min(delta, 0.05);
    const ahead = (keys.has('forward') ? 1 : 0) - (keys.has('back') ? 1 : 0);
    const aside = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    let moveX = 0;
    let moveZ = 0;
    if (ahead !== 0 || aside !== 0) {
      const [forwardX, forwardZ] = forwardOf(viewYawRef.current);
      const [rightX, rightZ] = forwardOf(viewYawRef.current - 90);
      moveX = forwardX * ahead + rightX * aside;
      moveZ = forwardZ * ahead + rightZ * aside;
      const length = Math.hypot(moveX, moveZ);
      moveX /= length;
      moveZ /= length;
    }
    const isMoving = moveX !== 0 || moveZ !== 0;
    if (isMoving) {
      const speed = keys.has('run') ? OWNER_RUN : OWNER_WALK;
      proposed.set(own.position.x + moveX * speed * dt, 0, own.position.z + moveZ * speed * dt);
      own.node = navigation.clampStep(own.position, proposed, own.node, clamped);
      own.position.set(clamped.x, 0, clamped.z);
      own.yawDeg = turnTowards(own.yawDeg, Math.atan2(moveX, moveZ) / DEG, TURN_SPEED * dt);
      timeScaleRef.current = speed / WALK_SPEED;
    }
    group.position.copy(own.position);
    group.rotation.y = radiansOf(own.yawDeg);
    clipRef.current = isMoving ? 'walk' : 'idle';
    const isNear = distanceXz(own.position, computerPosition) <= computer.use_radius;
    if (isNear !== own.isNearComputer) {
      own.isNearComputer = isNear;
      setCanUseComputer(isNear);
    }
  });

  return (
    <Character
      appearance={appearance}
      clipRef={clipRef}
      timeScaleRef={timeScaleRef}
      groupRef={groupRef}
      position={spawn.position}
      rotationY={radiansOf(spawn.yaw_deg)}
    />
  );
}
