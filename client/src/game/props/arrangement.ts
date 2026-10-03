import type { WorldPlacement } from '@tbn/contracts';
import type { NamedPoint } from '../world/navGrid.ts';
import type { Anchor, DeskAnchor, Footprint, Vec3 } from './builder.ts';
import { PROP_CATALOG, type SpotAnchor } from './catalog.ts';
import type { ComputerAnchor } from './furniture.ts';
import { propModel, sizeOf } from './propModel.ts';

/** A department's zone: its desks, the manager's first. */
export interface ArrangedZone {
  name: string;
  label: string;
  desks: DeskAnchor[];
}

/** What the fixed shell of a pack offers, besides its walls. */
export interface ShellAnchors {
  entry: Anchor;
  exit: Anchor;
  spawn: Anchor;
  waiting: Anchor[];
  spots: SpotAnchor[];
  blocks: Footprint[];
}

/** What a layout makes of a pack: its zones, the computer, its spots and the blocked floor. */
export interface Arrangement {
  zones: ArrangedZone[];
  computer: ComputerAnchor | null;
  spots: SpotAnchor[];
  /** Every footprint that blocks the floor: the shell's walls and each prop's. */
  footprints: Footprint[];
  /** The points someone must stand on and reach, the entry first. Spots are not among them:
   * a spot nobody can reach is simply left out. */
  reach: NamedPoint[];
}

/** A point of a prop, from its own frame to the floor's. */
export function toWorld(placement: Pick<WorldPlacement, 'x' | 'z' | 'yaw_deg'>, local: Vec3): Vec3 {
  const yaw = (placement.yaw_deg * Math.PI) / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    placement.x + local[0] * cos + local[2] * sin,
    local[1],
    placement.z - local[0] * sin + local[2] * cos,
  ];
}

/** A footprint of a prop, turned and moved onto the floor, as the rectangle it covers there. */
export function footprintToWorld(
  placement: Pick<WorldPlacement, 'x' | 'z' | 'yaw_deg'>,
  local: Footprint,
): Footprint {
  const corners = [
    toWorld(placement, [local.minX, 0, local.minZ]),
    toWorld(placement, [local.maxX, 0, local.minZ]),
    toWorld(placement, [local.minX, 0, local.maxZ]),
    toWorld(placement, [local.maxX, 0, local.maxZ]),
  ];
  const xs = corners.map((corner) => corner[0]);
  const zs = corners.map((corner) => corner[2]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/** The floor a zone rug covers. */
export function rugArea(placement: WorldPlacement): Footprint {
  const { width, depth } = sizeOf(placement);
  return footprintToWorld(placement, {
    minX: -width / 2,
    maxX: width / 2,
    minZ: -depth / 2,
    maxZ: depth / 2,
  });
}

function isInside(area: Footprint, point: Vec3): boolean {
  return (
    point[0] >= area.minX && point[0] <= area.maxX && point[2] >= area.minZ && point[2] <= area.maxZ
  );
}

function anchorToWorld<T extends Anchor>(placement: WorldPlacement, anchor: T): T {
  return {
    ...anchor,
    position: toWorld(placement, anchor.position),
    yaw_deg: anchor.yaw_deg + placement.yaw_deg,
  };
}

/**
 * Makes a pack's zones, computer, spots and blocked floor out of a layout. A desk belongs to the
 * zone whose rug its seat stands on, in the order the layout lists them, so the manager keeps the
 * first; a desk on no rug is left free.
 */
export function arrange(shell: ShellAnchors, placements: readonly WorldPlacement[]): Arrangement {
  const footprints = [...shell.blocks];
  const desks: DeskAnchor[] = [];
  const spots = [...shell.spots];
  const reach: NamedPoint[] = [
    { name: 'the entry', x: shell.entry.position[0], z: shell.entry.position[2] },
    { name: 'the exit', x: shell.exit.position[0], z: shell.exit.position[2] },
    { name: 'where you start', x: shell.spawn.position[0], z: shell.spawn.position[2] },
    ...shell.waiting.map((anchor, index) => ({
      name: `waiting place ${index + 1}`,
      x: anchor.position[0],
      z: anchor.position[2],
    })),
  ];
  let computer: ComputerAnchor | null = null;
  for (const placement of placements) {
    const model = propModel(placement);
    const label = PROP_CATALOG[placement.kind].label;
    for (const footprint of model.footprints)
      footprints.push(footprintToWorld(placement, footprint));
    for (const anchor of model.anchors.desks) {
      const placed = anchorToWorld(placement, anchor);
      placed.seat = toWorld(placement, anchor.seat);
      desks.push(placed);
      reach.push({
        name: `a seat at the ${label.toLowerCase()}`,
        x: placed.seat[0],
        z: placed.seat[2],
      });
    }
    for (const anchor of model.anchors.spots) {
      const placed = anchorToWorld(placement, anchor);
      if (anchor.seat !== undefined) placed.seat = toWorld(placement, anchor.seat);
      spots.push(placed);
    }
    for (const point of model.anchors.reach) {
      const at = toWorld(placement, point);
      reach.push({ name: `the chair at ${label.toLowerCase()}`, x: at[0], z: at[2] });
    }
    if (model.anchors.computer !== null)
      computer = anchorToWorld(placement, model.anchors.computer);
  }
  const zones = placements
    .filter((placement) => placement.kind === 'zone_rug')
    .toSorted((a, b) => (a.zone ?? 0) - (b.zone ?? 0))
    .map((placement, index) => {
      const area = rugArea(placement);
      const number = placement.zone ?? index + 1;
      return {
        name: `zone_${number}`,
        label: `Zone ${number}`,
        desks: desks.filter((desk) => isInside(area, desk.seat)),
      };
    });
  return { zones, computer, spots, footprints, reach };
}
