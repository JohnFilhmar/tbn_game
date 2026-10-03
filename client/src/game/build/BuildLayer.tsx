import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { RefObject } from 'react';
import { rugArea } from '@/game/props/arrangement';
import type { ArrangedPack } from '@/game/props/arrangedPack';
import { blockedBy, placementProblem } from '@/game/props/layoutProblems';
import { Props } from '@/game/props/Props';
import type { MoveAction } from '@/game/world/keyboard';
import type { Footprint } from '@/game/props/builder';
import { useBuildStore } from './buildStore';
import { snap } from './draft';
import { dropHeld } from './placing';

/** Props of `BuildLayer`. */
export interface BuildLayerProps {
  arranged: ArrangedPack;
  /** The movement keys, which pan the camera's focus while building. */
  keysRef: RefObject<Set<MoveAction>>;
}

/** Metres a second the focus pans. */
const PAN_SPEED = 6;
const ZONE_COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
  '#eab308',
];

/** A flat tinted rectangle on the floor over `area`. */
function FloorPatch({
  area,
  color,
  opacity,
  lift,
}: {
  area: Footprint;
  color: string;
  opacity: number;
  lift: number;
}) {
  return (
    <mesh
      position={[(area.minX + area.maxX) / 2, lift, (area.minZ + area.maxZ) / 2]}
      rotation-x={-Math.PI / 2}
      raycast={() => undefined}
    >
      <planeGeometry args={[area.maxX - area.minX, area.maxZ - area.minZ]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/**
 * What build mode adds inside the scene: a floor that follows the pointer on the grid, the held
 * prop drawn green where it fits and red where it does not, a highlight under the selected prop,
 * and every department's zone rug as a tinted area. Clicking the floor drops what is held, or
 * clears the selection.
 */
export function BuildLayer({ arranged, keysRef }: BuildLayerProps) {
  const holding = useBuildStore((state) => state.holding);
  const selectedId = useBuildStore((state) => state.selectedId);
  const draft = useBuildStore((state) => state.history?.present ?? null);
  const hold = useBuildStore((state) => state.hold);
  const select = useBuildStore((state) => state.select);
  const { manifest } = arranged;
  const placements = draft?.placements ?? [];
  const problem =
    holding === null ? null : placementProblem(manifest.bounds, manifest, holding, placements);
  const selected = placements.find((one) => one.id === selectedId);

  useFrame((_, delta) => {
    const keys = keysRef.current;
    const ahead = (keys.has('back') ? 1 : 0) - (keys.has('forward') ? 1 : 0);
    const aside = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    if (ahead === 0 && aside === 0) return;
    const step = PAN_SPEED * Math.min(delta, 0.1);
    const { focus } = useBuildStore.getState();
    const { bounds } = manifest;
    focus.x = Math.min(bounds.max_x, Math.max(bounds.min_x, focus.x + aside * step));
    focus.z = Math.min(bounds.max_z, Math.max(bounds.min_z, focus.z + ahead * step));
  });

  const onMove = (event: ThreeEvent<PointerEvent>): void => {
    const current = useBuildStore.getState().holding;
    if (current === null) return;
    const x = snap(event.point.x);
    const z = snap(event.point.z);
    if (x !== current.x || z !== current.z) hold({ ...current, x, z });
  };
  const onClick = (event: ThreeEvent<MouseEvent>): void => {
    if (event.delta > 6) return;
    if (useBuildStore.getState().holding === null) select(null);
    else dropHeld(manifest.bounds, manifest);
  };

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} onPointerMove={onMove} onClick={onClick}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {placements
        .filter((one) => one.kind === 'zone_rug')
        .map((rug) => (
          <FloorPatch
            key={rug.id}
            area={rugArea(rug)}
            color={ZONE_COLORS[((rug.zone ?? 1) - 1) % ZONE_COLORS.length] ?? '#3b82f6'}
            opacity={rug.id === selectedId ? 0.45 : 0.2}
            lift={0.02}
          />
        ))}
      {selected !== undefined &&
        blockedBy(selected).map((area, index) => (
          <FloorPatch key={index} area={area} color="#2f9a55" opacity={0.5} lift={0.03} />
        ))}
      {holding !== null && (
        <>
          <Props
            placements={[holding]}
            theme={arranged.theme}
            ghost={problem === null ? 'fits' : 'blocked'}
          />
          {blockedBy(holding).map((area, index) => (
            <FloorPatch
              key={index}
              area={area}
              color={problem === null ? '#2f9a55' : '#ef4444'}
              opacity={0.45}
              lift={0.03}
            />
          ))}
          {holding.kind === 'zone_rug' && (
            <FloorPatch area={rugArea(holding)} color="#3b82f6" opacity={0.35} lift={0.02} />
          )}
        </>
      )}
    </>
  );
}
