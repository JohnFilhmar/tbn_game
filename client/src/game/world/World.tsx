import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import type { Agent, Department } from '@tbn/contracts';
import { Suspense, useEffect, useRef, useState, type RefObject } from 'react';
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
  /** False while the desk covers the world: the keys rest and the frames stop. */
  isActive: boolean;
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

interface PackWorldProps extends Omit<WorldProps, 'isActive'> {
  keysRef: RefObject<Set<MoveAction>>;
}

/** Everything that belongs to one pack; a pack switch replaces it whole. */
function PackWorld({ pack, hour, ownerAppearance, agents, departments, keysRef }: PackWorldProps) {
  const [navigation, setNavigation] = useState<Navigation | null>(null);
  const cameraMode = useWorldStore((state) => state.cameraMode);
  const ownerRef = useRef<Group | null>(null);
  const viewYawRef = useRef(pack.manifest.spawn.yaw_deg);
  const { manifest } = pack;
  return (
    <>
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
            />
          </Suspense>
          {agents !== undefined && departments !== undefined && (
            <Agents pack={pack} navigation={navigation} agents={agents} departments={departments} />
          )}
          <CameraRig
            targetRef={ownerRef}
            mode={cameraMode}
            ceiling={manifest.ceiling}
            initialYawDeg={manifest.spawn.yaw_deg}
            viewYawRef={viewYawRef}
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

/** The 3D world: one canvas that lives as long as the owner is signed in. */
export function World({ pack, hour, ownerAppearance, agents, departments, isActive }: WorldProps) {
  const keysRef = useMovementKeys(isActive);
  useEffect(() => {
    useLoader.preload(GLTFLoader, characterFiles());
  }, []);
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 1.5]}
      frameloop={isActive ? 'always' : 'never'}
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
        />
      </Suspense>
      <FrameCounter />
    </Canvas>
  );
}
