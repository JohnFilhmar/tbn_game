import { useFrame, useThree } from '@react-three/fiber';
import type { WorldPlacement } from '@tbn/contracts';
import { useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from 'three';
import { toWorld } from '@/game/props/arrangement';
import { BLINDS_DROP, BLINDS_TOP } from '@/game/props/fixtures';
import { sizeOf } from '@/game/props/propModel';
import { prefersReducedMotion } from '@/game/world/motion';
import { stateOf, type PropStates } from './propStates';

/** Props of `Blinds`. */
export interface BlindsProps {
  /** The blinds placements of the layout. */
  blinds: readonly WorldPlacement[];
  states: PropStates;
  /** Called with a blinds' id when its slats are clicked; build mode selects it. */
  onPick?: (placementId: string) => void;
}

const SLATS = 12;
/** How far apart the slats hang when drawn up, in metres. */
const STACKED = 0.012;
/** How quickly the blinds open or close: a share of the whole way each second. */
const SPEED = 1.5;
/** How far drawn up slats tip, in radians, so they read as gathered. */
const OPEN_TILT = 1.2;
const SLAT = new BoxGeometry(1, 0.1, 0.012);
const MATERIAL = new MeshStandardMaterial({ name: 'blinds', color: '#ece6d8', roughness: 0.9 });

/**
 * The slats of every window's blinds as one instanced mesh. Closed, they hang down over the glass;
 * open, they are drawn up under the rail. A change slides between the two, at once under reduced
 * motion, and a reload starts each in place.
 */
export function Blinds({ blinds, states, onPick }: BlindsProps) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const amounts = useRef(new Map<string, number>());
  const scratch = useMemo(
    () => ({
      matrix: new Matrix4(),
      rotation: new Quaternion(),
      euler: new Euler(0, 0, 0, 'YXZ'),
      position: new Vector3(),
      scale: new Vector3(),
    }),
    [],
  );

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (mesh === null) return;
    let isMoving = false;
    blinds.forEach((placement, index) => {
      const target = stateOf.isOpen(states, placement.id) ? 0 : 1;
      const current = amounts.current.get(placement.id) ?? target;
      const step = prefersReducedMotion() ? 1 : SPEED * Math.min(delta, 0.1);
      const next =
        Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;
      if (next !== target) isMoving = true;
      amounts.current.set(placement.id, next);
      const spacing = STACKED + (BLINDS_DROP / SLATS - STACKED) * next;
      const yaw = (placement.yaw_deg * Math.PI) / 180;
      scratch.euler.set(OPEN_TILT * (1 - next), yaw, 0);
      scratch.rotation.setFromEuler(scratch.euler);
      scratch.scale.set(sizeOf(placement).width, 1, 1);
      for (let slat = 0; slat < SLATS; slat += 1) {
        const [x, y, z] = toWorld(placement, [0, BLINDS_TOP - 0.05 - slat * spacing, 0.03]);
        scratch.position.set(x, y, z);
        mesh.setMatrixAt(
          index * SLATS + slat,
          scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale),
        );
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (isMoving) invalidate();
  });

  return (
    <instancedMesh
      key={blinds.length}
      ref={ref}
      args={[SLAT, MATERIAL, blinds.length * SLATS]}
      castShadow
      onClick={(event) => {
        const placement =
          event.instanceId === undefined ? undefined : blinds[Math.floor(event.instanceId / SLATS)];
        if (placement === undefined || onPick === undefined) return;
        event.stopPropagation();
        onPick(placement.id);
      }}
    />
  );
}
