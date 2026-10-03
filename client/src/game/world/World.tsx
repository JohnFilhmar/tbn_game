import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import type { Agent, Department, PropKind, WorldPlacement } from '@tbn/contracts';
import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react';
import type { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ResolvedAppearance } from '@/game/assets/appearance';
import { CHARACTER_SET } from '@/game/assets/characters';
import type { ArrangedPack } from '@/game/props/arrangedPack';
import { BuildLayer } from '@/game/build/BuildLayer';
import { useBuildStore } from '@/game/build/buildStore';
import { Blinds } from '@/game/objects/Blinds';
import { BoardFaces } from '@/game/objects/BoardFaces';
import { Effects } from '@/game/objects/Effects';
import { Lamps } from '@/game/objects/Lamps';
import { LiveProps } from '@/game/objects/LiveProps';
import type { LiveData } from '@/game/objects/liveData';
import { daylightScale } from '@/game/objects/lighting';
import { stateOf, type PropStates } from '@/game/objects/propStates';
import { boardFrame, boardPoseOf } from '@/game/objects/whiteboard/frame';
import { INTERACTIONS } from '@/game/props/interactions';
import { Props } from '@/game/props/Props';
import { Agents } from '@/game/npcs/Agents';
import { CameraRig, FOV } from './CameraRig';
import { Lighting } from './Lighting';
import { liveView } from './livePositions';
import { useMovementKeys, type MoveAction } from './keyboard';
import { gridGeometry, walkGrid } from './navGrid';
import { Navigation } from './navmesh';
import { OwnerCharacter } from './OwnerCharacter';
import { PackScene } from './PackScene';
import { seatPoseOf } from './seat';
import { lightingAt } from './timeOfDay';
import { useWorldStore } from './worldStore';

/** Props of `World`. */
export interface WorldProps {
  /** The pack as the owner arranged it: shell, props, theme and what they make. */
  arranged: ArrangedPack;
  hour: number;
  ownerAppearance: ResolvedAppearance;
  /** The roster; the agents enter the world once both are loaded. */
  agents: readonly Agent[] | undefined;
  departments: readonly Department[] | undefined;
  /** False while the owner is seated or signed out: the keys rest. */
  isActive: boolean;
  /** True while the owner sits at the computer: the camera looks at the monitor. */
  isSeated: boolean;
  /** True while the camera glides to or from the seat: every frame renders until it ends. */
  isGliding: boolean;
  /** The agents with an approval waiting for the owner, who wear a marker. */
  pendingAgentIds: ReadonlySet<string>;
  /** True while the owner builds: the camera looks down at an angle and props can be picked. */
  isBuilding: boolean;
  /** The saved state of each prop that keeps one: blinds, lamps, whiteboards, plants, radios. */
  propStates: PropStates;
  /** What the company's objects show: the inbox, the cork board, the rack, the trophies. */
  live: LiveData;
  /** The plants and trees that droop for want of water. */
  thirstyIds: ReadonlySet<string>;
}

/** The yellow of a plant that wants water. */
const THIRSTY_COLOR = '#a39a45';

function FrameCounter() {
  const setFps = useWorldStore((state) => state.setFps);
  const counter = useRef({ frames: 0, since: 0 });
  useFrame((state) => {
    const own = counter.current;
    own.frames += 1;
    const now = state.clock.elapsedTime;
    if (now - own.since >= 1) {
      setFps(Math.round(own.frames / (now - own.since)));
      own.frames = 0;
      own.since = now;
    }
  });
  return null;
}

/**
 * The ground every pack stands on, a low poly disc that runs out into the fog. It takes no shadow
 * and the cheapest lit material, since it can fill a third of the screen.
 */
function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
      <circleGeometry args={[160, 9]} />
      <meshLambertMaterial color="#7d8f6a" />
    </mesh>
  );
}

/** Hands the world's camera to the DOM overlays that follow something in the scene. */
function CameraPublisher() {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    liveView.camera = camera;
    return () => {
      liveView.camera = null;
    };
  }, [camera]);
  return null;
}

interface PackWorldProps extends Omit<WorldProps, 'isActive' | 'isGliding'> {
  keysRef: RefObject<Set<MoveAction>>;
}

/** Everything that belongs to one pack; a pack switch replaces it whole. */
function PackWorld({
  arranged,
  hour,
  ownerAppearance,
  agents,
  departments,
  keysRef,
  isSeated,
  pendingAgentIds,
  isBuilding,
  propStates,
  live,
  thirstyIds,
}: PackWorldProps) {
  const { pack, manifest } = arranged;
  // ponytail: rebuilt whole on every layout change; a grid of a few thousand cells takes
  // milliseconds, so there is no incremental update.
  const navigation = useMemo(
    () => new Navigation(gridGeometry(walkGrid(manifest.bounds, arranged.footprints))),
    [manifest.bounds, arranged.footprints],
  );
  const cameraMode = useWorldStore((state) => state.cameraMode);
  const talkingTo = useWorldStore((state) => state.talkingTo);
  const ownerRef = useRef<Group | null>(null);
  const viewYawRef = useRef(manifest.spawn.yaw_deg);
  const pose = useMemo(() => seatPoseOf(arranged.computer), [arranged.computer]);
  const heldId = useBuildStore((state) => state.holding?.id);
  const seatPose = isSeated ? pose : null;
  const placements = useMemo(
    () =>
      heldId === undefined
        ? arranged.placements
        : arranged.placements.filter((placement) => placement.id !== heldId),
    [arranged.placements, heldId],
  );
  // A thirsty plant is drawn yellowed, which the batching keeps as one draw per colour.
  const shown = useMemo(
    () =>
      placements.map((placement) =>
        thirstyIds.has(placement.id) ? { ...placement, color: THIRSTY_COLOR } : placement,
      ),
    [placements, thirstyIds],
  );
  const byKind = useMemo(() => {
    const of = (kind: PropKind): WorldPlacement[] =>
      placements.filter((placement) => placement.kind === kind);
    return { lamps: of('lamp'), blinds: of('blinds'), boards: of('whiteboard') };
  }, [placements]);
  const usableProps = useMemo(
    () =>
      placements.flatMap((placement) => {
        const interaction = INTERACTIONS[placement.kind];
        return interaction === undefined
          ? []
          : [
              {
                placementId: placement.id,
                x: placement.x,
                z: placement.z,
                reach: interaction.reach,
              },
            ];
      }),
    [placements],
  );
  const daylight = daylightScale(
    byKind.blinds.map((placement) => stateOf.isOpen(propStates, placement.id)),
  );
  const drawingOn = useWorldStore((state) => state.drawingOn);
  const viewport = useThree((state) => state.size);
  const boardPose = useMemo(() => {
    const board = byKind.boards.find((placement) => placement.id === drawingOn);
    if (board === undefined || isSeated) return null;
    return boardPoseOf(board, boardFrame(viewport.width, viewport.height).share, FOV);
  }, [byKind.boards, drawingOn, isSeated, viewport.width, viewport.height]);
  const isLit = lightingAt(hour).interiorOn;
  const onPick = isBuilding ? (id: string) => useBuildStore.getState().select(id) : undefined;
  return (
    <>
      <Ground />
      <PackScene pack={pack} isLit={isLit} theme={arranged.theme} />
      <Props placements={shown} theme={arranged.theme} onPick={onPick} />
      <LiveProps placements={placements} live={live} hour={hour} onPick={onPick} />
      <Lamps lamps={byKind.lamps} states={propStates} isInteriorOn={isLit} onPick={onPick} />
      <Blinds blinds={byKind.blinds} states={propStates} onPick={onPick} />
      <BoardFaces boards={byKind.boards} states={propStates} theme={arranged.theme} />
      <Effects />
      {isBuilding && <BuildLayer arranged={arranged} keysRef={keysRef} />}
      <Lighting
        hour={hour}
        profile={manifest.lighting}
        bounds={manifest.bounds}
        daylight={daylight}
      />
      <>
        <Suspense fallback={null}>
          <OwnerCharacter
            navigation={navigation}
            spawn={manifest.spawn}
            computer={arranged.computer}
            appearance={ownerAppearance}
            keysRef={keysRef}
            viewYawRef={viewYawRef}
            groupRef={ownerRef}
            seatPose={seatPose}
            usableProps={isBuilding ? [] : usableProps}
          />
        </Suspense>
        {agents !== undefined && departments !== undefined && (
          <Agents
            arranged={arranged}
            navigation={navigation}
            agents={agents}
            departments={departments}
            pendingAgentIds={pendingAgentIds}
          />
        )}
        <CameraRig
          targetRef={ownerRef}
          mode={cameraMode}
          ceiling={manifest.ceiling}
          initialYawDeg={manifest.spawn.yaw_deg}
          viewYawRef={viewYawRef}
          seatPose={seatPose}
          talkingTo={talkingTo}
          isBuilding={isBuilding}
          boardPose={boardPose}
        />
      </>
    </>
  );
}

/** Every file of the character set, so a character that arrives later is dressed at once. */
function characterFiles(): string[] {
  const { manifest, urlOf } = CHARACTER_SET;
  return [
    ...Object.values(manifest.bodies).map((body) => urlOf(body.file)),
    ...Object.values(manifest.parts).flatMap((files) => Object.values(files).map(urlOf)),
  ];
}

/**
 * The 3D world: one canvas for the whole visit, signed in or not. While the owner is seated it
 * renders only on change once the glide is over, so the desk costs no frames.
 */
export function World({
  arranged,
  hour,
  ownerAppearance,
  agents,
  departments,
  isActive,
  isSeated,
  isGliding,
  pendingAgentIds,
  isBuilding,
  propStates,
  live,
  thirstyIds,
}: WorldProps) {
  const talkingTo = useWorldStore((state) => state.talkingTo);
  const drawingOn = useWorldStore((state) => state.drawingOn);
  const panel = useWorldStore((state) => state.panel);
  const keysRef = useMovementKeys(
    isActive && talkingTo === null && drawingOn === null && panel === null,
  );
  useEffect(() => {
    useLoader.preload(GLTFLoader, characterFiles());
  }, []);
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 1.5]}
      frameloop={isActive || isGliding ? 'always' : 'demand'}
      camera={{ fov: 50, near: 0.1, far: 300, position: [0, 8, 14] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      className="h-full w-full"
      aria-hidden
    >
      <Suspense fallback={null}>
        <PackWorld
          key={arranged.manifest.name}
          arranged={arranged}
          hour={hour}
          ownerAppearance={ownerAppearance}
          agents={agents}
          departments={departments}
          keysRef={keysRef}
          isSeated={isSeated}
          pendingAgentIds={pendingAgentIds}
          isBuilding={isBuilding}
          propStates={propStates}
          live={live}
          thirstyIds={thirstyIds}
        />
      </Suspense>
      <FrameCounter />
      <CameraPublisher />
    </Canvas>
  );
}
