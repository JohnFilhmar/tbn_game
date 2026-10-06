import { useFrame } from '@react-three/fiber';
import { PlayerActSchema, type PlayerAct } from '@tbn/contracts';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Vector3, type Group } from 'three';
import type { ResolvedAppearance } from '@/game/assets/appearance';
import type { ClipName } from '@/game/assets/characterManifest';
import { forwardOf, radiansOf, turnTowards, vec3, yawTowards } from '@/game/assets/geometry';
import type { Anchor, ComputerAnchor } from '@/game/assets/packManifest';
import { WALK_SPEED } from '@/game/npcs/agentActor';
import { useBuildStore } from '@/game/build/buildStore';
import { usePlayerUiStore } from '@/game/players/playerUiStore';
import { cueSound } from '@/game/sound/soundCues';
import { Character } from './Character';
import type { MoveAction } from './keyboard';
import { livePositions, localPose, OWNER_KEY, playerPositions } from './livePositions';
import type { Navigation, NavNode } from './navmesh';
import { promptAt, propsInReach, type Prompt, type UsableProp } from './prompt';
import { seatPoseOf, type SeatPose } from './seat';
import { useWorldStore } from './worldStore';

/** Writes the pose this client sends the other players. */
function showPose(
  at: Vector3,
  yawDeg: number,
  isMoving: boolean,
  isRunning: boolean,
  act: PlayerAct | null,
): void {
  localPose.x = at.x;
  localPose.y = at.y;
  localPose.z = at.z;
  localPose.yawDeg = yawDeg;
  localPose.isMoving = isMoving;
  localPose.isRunning = isRunning;
  localPose.act = act;
  localPose.isPlaced = true;
}

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
  /** The props the owner can use, with their reach. */
  usableProps: readonly UsableProp[];
}

/** What the character keeps between frames. */
interface OwnerState {
  position: Vector3;
  yawDeg: number;
  /** The navigation polygon of the last step, for the next clamp. */
  node: NavNode | null;
  /** The last prompt told to the store, as a key: '', 'computer', an agent id or a prop id,
   * with the props in reach after it. */
  promptKey: string;
  wasSeated: boolean;
  /** The last teleport request taken. */
  teleportId: number;
  /** The last unstuck request taken. */
  unstuckId: number;
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
 * clamping every step, and watched for what E would act on: the computer or an agent in reach.
 * While talking to an agent it turns to face it and stays put. Seated, it works in
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
  usableProps,
}: OwnerCharacterProps) {
  const setCanUseComputer = useWorldStore((state) => state.setCanUseComputer);
  const setNearAgentId = useWorldStore((state) => state.setNearAgentId);
  const setNearProps = useWorldStore((state) => state.setNearProps);
  // An owner who sat at the computer before the world drew stands up beside the chair.
  const [startsAtChair] = useState(() => useWorldStore.getState().hasSat);
  const state = useRef<OwnerState>({
    position: startsAtChair ? seatPoseOf(computer).chair : vec3(spawn.position),
    yawDeg: startsAtChair ? computer.yaw_deg : spawn.yaw_deg,
    node: null,
    promptKey: '',
    wasSeated: startsAtChair,
    teleportId: useWorldStore.getState().teleport?.id ?? 0,
    unstuckId: usePlayerUiStore.getState().unstuckId,
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
      localPose.isPlaced = false;
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const group = groupRef.current;
    if (group === null) return;
    const own = state.current;
    if (seatPose !== null) {
      if (!own.wasSeated) cueSound('sit', seatPose.chair);
      own.position.copy(seatPose.chair);
      own.yawDeg = seatPose.yawDeg;
      own.node = null;
      own.wasSeated = true;
      group.position.copy(own.position);
      group.rotation.y = radiansOf(own.yawDeg);
      clipRef.current = 'work';
      showPose(own.position, own.yawDeg, false, false, null);
      head.set(own.position.x, HEAD_HEIGHT, own.position.z);
      group.visible = camera.position.distanceTo(head) > HIDE_WITHIN;
      return;
    }
    group.visible = true;
    if (own.wasSeated) {
      own.wasSeated = false;
      useWorldStore.getState().setHasSat(false);
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
    const { unstuckId, chatWith } = usePlayerUiStore.getState();
    if (unstuckId !== own.unstuckId) {
      own.unstuckId = unstuckId;
      const start = navigation.snap(vec3(spawn.position));
      own.node = navigation.clampStep(start, vec3(spawn.position), null, clamped);
      own.position.set(clamped.x, 0, clamped.z);
      own.yawDeg = spawn.yaw_deg;
    }
    const keys = keysRef.current;
    const dt = Math.min(delta, 0.05);
    const { talkingTo, drawingOn, acting, stopActing } = useWorldStore.getState();
    const partner =
      talkingTo !== null
        ? livePositions.get(talkingTo)
        : chatWith === null
          ? undefined
          : playerPositions.get(chatWith);
    if (useBuildStore.getState().environment !== null) {
      // Building: the movement keys pan the view instead.
      group.position.copy(own.position);
      clipRef.current = 'idle';
      return;
    }
    if (drawingOn !== null) {
      // Drawing: the camera stands where the owner would block the board, so the owner hides.
      group.visible = false;
      group.position.copy(own.position);
      clipRef.current = 'idle';
      showPose(own.position, own.yawDeg, false, false, 'write');
      return;
    }
    if (partner !== undefined) {
      // Talking: the owner turns to the agent and never moves.
      own.yawDeg = turnTowards(own.yawDeg, yawTowards(own.position, partner), TURN_SPEED * dt);
      group.position.copy(own.position);
      group.rotation.y = radiansOf(own.yawDeg);
      clipRef.current = 'idle';
      return;
    }
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
    const isActing = acting !== null && !isMoving && performance.now() / 1000 < acting.until;
    if (acting !== null && !isActing) stopActing();
    if (isActing) {
      // Using a prop: the owner turns to it and plays its clip where they stand.
      own.yawDeg = turnTowards(own.yawDeg, acting.yawDeg, TURN_SPEED * dt);
      group.position.copy(acting.seat ?? own.position);
      group.rotation.y = radiansOf(own.yawDeg);
      clipRef.current = acting.clip;
      const act = PlayerActSchema.safeParse(acting.clip);
      showPose(group.position, own.yawDeg, false, false, act.success ? act.data : null);
      return;
    }
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
    showPose(own.position, own.yawDeg, isMoving, isMoving && keys.has('run'), null);
    const agents = new Map(livePositions);
    agents.delete(OWNER_KEY);
    const prompt: Prompt = promptAt({
      owner: own.position,
      facingDeg: own.yawDeg,
      computer: computerPosition,
      computerReach: computer.use_radius,
      agents,
      players: playerPositions,
      props: usableProps,
    });
    const reachable = propsInReach(own.position, usableProps);
    const promptId =
      prompt === null
        ? ''
        : prompt.kind === 'computer'
          ? 'computer'
          : prompt.kind === 'agent'
            ? prompt.agentId
            : prompt.kind === 'player'
              ? prompt.playerId
              : prompt.placementId;
    const key = [promptId, ...reachable].join(' ');
    if (key !== own.promptKey) {
      own.promptKey = key;
      setCanUseComputer(prompt?.kind === 'computer');
      setNearAgentId(prompt?.kind === 'agent' ? prompt.agentId : null);
      usePlayerUiStore
        .getState()
        .setNearPlayerId(prompt?.kind === 'player' ? prompt.playerId : null);
      setNearProps(prompt?.kind === 'prop' ? prompt.placementId : null, reachable);
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
      isHeard
    />
  );
}
