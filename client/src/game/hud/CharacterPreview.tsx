import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef, type ReactNode, type RefObject } from 'react';
import type { Group } from 'three';
import type { ResolvedAppearance } from '@/game/assets/appearance';
import type { ClipName } from '@/game/assets/characterManifest';
import { Character } from '@/game/world/Character';

function Turntable({
  groupRef,
  children,
}: {
  groupRef: RefObject<Group | null>;
  children: ReactNode;
}) {
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (group !== null) group.rotation.y += delta * 0.6;
  });
  return children;
}

/** Props of `CharacterPreview`. */
export interface CharacterPreviewProps {
  appearance: ResolvedAppearance;
}

/** A character turning slowly on its own small canvas, for a form to show what it builds. */
export function CharacterPreview({ appearance }: CharacterPreviewProps) {
  const groupRef = useRef<Group | null>(null);
  const clipRef = useRef<ClipName>('idle');
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: 35, near: 0.1, far: 50, position: [0, 1.5, 3.4] }}
      onCreated={({ camera }) => camera.lookAt(0, 0.95, 0)}
      className="h-64 w-full rounded-md"
      aria-hidden
    >
      <color attach="background" args={['#cbd5e1']} />
      <hemisphereLight args={['#dbeafe', '#6b5f4e', 0.8]} />
      <directionalLight position={[2, 4, 3]} intensity={2.4} />
      <Suspense fallback={null}>
        <Turntable groupRef={groupRef}>
          <Character
            appearance={appearance}
            clipRef={clipRef}
            groupRef={groupRef}
            position={[0, 0, 0]}
            rotationY={0}
          />
        </Turntable>
      </Suspense>
    </Canvas>
  );
}
