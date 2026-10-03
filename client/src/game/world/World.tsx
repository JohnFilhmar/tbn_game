import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import type { Agent, Department } from '@tbn/contracts';
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ResolvedAppearance } from '@/game/assets/appearance';
import { CHARACTER_SET } from '@/game/assets/characters';
import type { LoadedPack } from '@/game/assets/packs';
import { Agents } from '@/game/npcs/Agents';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { useMovementKeys, type MoveAction } from './keyboard';
import type { Navigation } from './navmesh';
import { OwnerCharacter } from './OwnerCharacter';
import { PackScene } from './PackScene';
import { seatPoseOf } from './seat';
import { lightingAt } from './timeOfDay';
import { useWorldStore } from './worldStore';

/** Props of `World`. */
export interface WorldProps {
  pack: LoadedPack;
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
}

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

/** The ground every pack stands on, a low poly disc that runs out into the fog. */
function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
      <circleGeometry args={[160, 9]} />
      <meshStandardMaterial color="#7d8f6a" flatShading />
    </mesh>
  );
}

interface PackWorldProps extends Omit<WorldProps, 'isActive' | 'isGliding'> {
  keysRef: RefObject<Set<MoveAction>>;
}

/** Everything that belongs to one pack; a pack switch replaces it whole. */
function PackWorld({
  pack,
  hour,
  ownerAppearance,
  agents,
  departments,
  keysRef,
  isSeated,
  pendingAgentIds,
}: PackWorldProps) {
  const [navigation, setNavigation] = useState<Navigation | null>(null);
  const cameraMode = useWorldStore((state) => state.cameraMode);
  const ownerRef = useRef<Group | null>(null);
  const viewYawRef = useRef(pack.manifest.spawn.yaw_deg);
  const { manifest } = pack;
  const pose = useMemo(() => seatPoseOf(manifest.computer), [manifest]);
  const seatPose = isSeated ? pose : null;
  return (
    <>
      <Ground />
      <PackScene pack={pack} isLit={lightingAt(hour).interiorOn} onNavigation={setNavigation} />
      <Lighting hour={hour} profile={manifest.lighting} bounds={manifest.bounds} />
      {navigation !== null && (
        <>
          <Suspense fallback={null}>
            <OwnerCharacter
              navigation={navigation}
              spawn={manifest.spawn}
              computer={manifest.computer}
              appearance={ownerAppearance}
              keysRef={keysRef}
              viewYawRef={viewYawRef}
              groupRef={ownerRef}
              seatPose={seatPose}
            />
          </Suspense>
          {agents !== undefined && departments !== undefined && (
            <Agents
              pack={pack}
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
          />
        </>
      )}
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
  pack,
  hour,
  ownerAppearance,
  agents,
  departments,
  isActive,
  isSeated,
  isGliding,
  pendingAgentIds,
}: WorldProps) {
  const keysRef = useMovementKeys(isActive);
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
          key={pack.manifest.name}
          pack={pack}
          hour={hour}
          ownerAppearance={ownerAppearance}
          agents={agents}
          departments={departments}
          keysRef={keysRef}
          isSeated={isSeated}
          pendingAgentIds={pendingAgentIds}
        />
      </Suspense>
      <FrameCounter />
    </Canvas>
  );
}
