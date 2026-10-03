import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import { Vector3, type Group } from 'three';
import type { ResolvedAppearance } from '@/game/assets/appearance';
import type { ClipName } from '@/game/assets/characterManifest';
import { distanceXz, forwardOf, radiansOf, turnTowards, vec3 } from '@/game/assets/geometry';
import type { Anchor, ComputerAnchor } from '@/game/assets/packManifest';
import { WALK_SPEED } from '@/game/npcs/agentActor';
import { Character } from './Character';
import type { MoveAction } from './keyboard';
import type { Navigation, NavNode } from './navmesh';
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
}

/** What the character keeps between frames. */
interface OwnerState {
  position: Vector3;
  yawDeg: number;
  /** The navigation polygon of the last step, for the next clamp. */
  node: NavNode | null;
  isNearComputer: boolean;
}

const OWNER_WALK = 1.6;
const OWNER_RUN = 3.6;
const TURN_SPEED = 600;
const DEG = Math.PI / 180;

/**
 * The owner's character: moved by the keys relative to the view, kept on the navigation mesh by
 * clamping every step, and watched for being within reach of the computer.
 */
export function OwnerCharacter({
  navigation,
  spawn,
  computer,
  appearance,
  keysRef,
  viewYawRef,
  groupRef,
}: OwnerCharacterProps) {
  const setCanUseComputer = useWorldStore((state) => state.setCanUseComputer);
  const state = useRef<OwnerState>({
    position: vec3(spawn.position),
    yawDeg: spawn.yaw_deg,
    node: null,
    isNearComputer: false,
  });
  const clipRef = useRef<ClipName>('idle');
  const timeScaleRef = useRef(1);
  const proposed = useMemo(() => new Vector3(), []);
  const clamped = useMemo(() => new Vector3(), []);
  const computerPosition = useMemo(() => vec3(computer.position), [computer]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (group === null) return;
    const own = state.current;
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
