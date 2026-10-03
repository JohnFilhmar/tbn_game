import type { ThreeEvent } from '@react-three/fiber';
import type { WorldPlacement, WorldTheme } from '@tbn/contracts';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
} from 'three';
import { isMesh, materialsOf } from '@/game/world/sceneObjects';
import { PROP_CATALOG } from './catalog';
import { modelKey, propModel } from './propModel';
import { themeColor } from './themes';

/** Props of `Props`. */
export interface PropsProps {
  placements: readonly WorldPlacement[];
  theme: WorldTheme;
  /** Called when a prop is clicked, with its id; build mode selects it. */
  onPick?: (placementId: string, event: ThreeEvent<MouseEvent>) => void;
  /** Draws the props as see-through stand-ins: green where they fit, red where they do not. */
  ghost?: 'fits' | 'blocked';
}

interface Batch {
  key: string;
  placements: WorldPlacement[];
  color: string | null;
}

interface InstancesProps {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  placements: readonly WorldPlacement[];
  onPick?: PropsProps['onPick'];
}

const UP = new Vector3(0, 1, 0);
const ONE = new Vector3(1, 1, 1);

/** One mesh of a model, drawn once for every placement that shares it. */
function Instances({ geometry, material, placements, onPick }: InstancesProps) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (mesh === null) return;
    const matrix = new Matrix4();
    const rotation = new Quaternion();
    const position = new Vector3();
    placements.forEach((placement, index) => {
      rotation.setFromAxisAngle(UP, (placement.yaw_deg * Math.PI) / 180);
      position.set(placement.x, 0, placement.z);
      mesh.setMatrixAt(index, matrix.compose(position, rotation, ONE));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // A new material or geometry makes a new mesh, which needs its instances placed again.
  }, [placements, material, geometry]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, placements.length]}
      castShadow={material.name !== 'light'}
      receiveShadow
      onClick={(event) => {
        const placement = event.instanceId === undefined ? undefined : placements[event.instanceId];
        if (placement === undefined || onPick === undefined) return;
        event.stopPropagation();
        onPick(placement.id, event);
      }}
    />
  );
}

function materialOf(
  name: string,
  color: string,
  ghost?: PropsProps['ghost'],
): MeshStandardMaterial {
  if (ghost !== undefined) {
    const tint = ghost === 'fits' ? '#4cb36d' : '#ef4444';
    return new MeshStandardMaterial({ name, color: tint, transparent: true, opacity: 0.55 });
  }
  const material = new MeshStandardMaterial({ name, color, roughness: 0.9 });
  if (name === 'glass') {
    material.transparent = true;
    material.opacity = 0.4;
  }
  return material;
}

/** Every placement of one model and colour, each of its meshes as one instanced draw. */
function BatchMeshes({
  batch,
  theme,
  onPick,
  ghost,
}: {
  batch: Batch;
  theme: WorldTheme;
  onPick?: PropsProps['onPick'];
  ghost?: PropsProps['ghost'];
}) {
  const [first] = batch.placements;
  const model = first === undefined ? null : propModel(first);
  const colorSlot = first === undefined ? null : PROP_CATALOG[first.kind].colorSlot;
  const parts = useMemo(
    () =>
      (model?.group.children ?? []).filter(isMesh).map((mesh) => {
        const name = materialsOf(mesh)[0]?.name ?? '';
        const color =
          batch.color !== null && name === colorSlot ? batch.color : themeColor(theme, name);
        return {
          key: mesh.name,
          geometry: mesh.geometry,
          material: materialOf(name, color, ghost),
        };
      }),
    [model, colorSlot, batch.color, theme, ghost],
  );
  useEffect(() => () => parts.forEach((part) => part.material.dispose()), [parts]);
  return (
    <>
      {parts.map((part) => (
        <Instances
          key={`${part.key}:${batch.placements.length}`}
          geometry={part.geometry}
          material={part.material}
          placements={batch.placements}
          onPick={onPick}
        />
      ))}
    </>
  );
}

/**
 * Every prop of a layout. Props that share a kind, a size, a variant and a colour are one model
 * drawn as instances, so sixteen desks cost one draw call per material, and the theme colours
 * them by material.
 */
export function Props({ placements, theme, onPick, ghost }: PropsProps) {
  const batches = useMemo(() => {
    const byKey = new Map<string, Batch>();
    for (const placement of placements) {
      const key = `${modelKey(placement)}:${placement.color ?? ''}`;
      const batch = byKey.get(key) ?? { key, placements: [], color: placement.color };
      batch.placements.push(placement);
      byKey.set(key, batch);
    }
    return [...byKey.values()];
  }, [placements]);
  return (
    <>
      {batches.map((batch) => (
        <BatchMeshes key={batch.key} batch={batch} theme={theme} onPick={onPick} ghost={ghost} />
      ))}
    </>
  );
}
