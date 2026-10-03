import {
  BASE_MATERIALS,
  computerDesk,
  desk,
  doorFrame,
  forklift,
  lamp,
  pallet,
  shelfUnit,
} from '../furniture.ts';
import { PackBuilder } from '../kit.ts';
import { anchorsOf, type PackResult } from '../manifest.ts';

const BOUNDS = { min_x: -12, max_x: 12, min_z: -8, max_z: 8 };
const CEILING = 6;

/** A warehouse: shelving rows down the middle and workbenches along the walls. */
export function buildWarehouse(): PackResult {
  const b = new PackBuilder({ ...BASE_MATERIALS, floor: '#8e8e8e', wall: '#b9b9b4' });
  b.floor('concrete', 24, 16);
  b.outerWall('wall', [-12, -8], [12, -8], CEILING, 0.3);
  b.outerWall('wall', [-12, -8], [-12, 8], CEILING, 0.3);
  b.outerWall('wall', [12, -8], [12, 8], CEILING, 0.3);
  b.outerWall('wall', [-12, 8], [-9.5, 8], CEILING, 0.3);
  b.outerWall('wall', [-6.5, 8], [12, 8], CEILING, 0.3);
  doorFrame(b, [-8, 8], 0, 3);
  b.box('metal', [3.3, 0.45, 0.35], [-8, 3.2, 8], 0, false);

  shelfUnit(b, [0, -2], 90, 10, { depth: 1, height: 2.8 });
  shelfUnit(b, [0, 2], 90, 10, { depth: 1, height: 2.8 });
  shelfUnit(b, [-11.3, -1], 0, 10, { depth: 1, height: 2.8 });
  shelfUnit(b, [11.3, -3], 0, 6, { depth: 1, height: 2.8 });

  const zones = [
    {
      name: 'zone_1',
      label: 'North west benches',
      desks: [-8, -6, -4, -2].map((x) => desk(b, [x, -7], 180)),
    },
    {
      name: 'zone_2',
      label: 'North east benches',
      desks: [2, 4, 6, 8].map((x) => desk(b, [x, -7], 180)),
    },
    {
      name: 'zone_3',
      label: 'South benches',
      desks: [0.5, 2.5, 4.5, 6.5].map((x) => desk(b, [x, 7], 0)),
    },
    {
      name: 'zone_4',
      label: 'East wall benches',
      desks: [2, 3.5, 5, 6.5].map((z) => desk(b, [11.3, z], 90)),
    },
  ];
  const { desk: ownerDesk, computer } = computerDesk(b, [-2.5, 5.4], 180);
  pallet(b, [-8.5, 3.5]);
  pallet(b, [-7.2, 3.5], 15);
  pallet(b, [-10.3, 5.8], 0);
  forklift(b, [8.5, -0.5], 90);
  const lights: [number, number][] = [
    [-6, -4.5],
    [6, -4.5],
    [-6, 4.5],
    [6, 4.5],
    [0, 0],
  ];
  for (const at of lights) lamp(b, at, CEILING);

  const manifest: PackResult['manifest'] = {
    name: 'warehouse',
    title: 'Warehouse',
    scale: 1,
    bounds: BOUNDS,
    ceiling: CEILING,
    spawn: { position: [-5, 0, 6.25], yaw_deg: 180 },
    entry: { position: [-8, 0, 7.25], yaw_deg: 180 },
    exit: { position: [-8, 0, 7.25], yaw_deg: 0 },
    computer,
    zones,
    waiting: [
      { position: [-7.5, 0, 0.25], yaw_deg: 90 },
      { position: [7, 0, 0.25], yaw_deg: 270 },
      { position: [0, 0, -0.25], yaw_deg: 0 },
      { position: [0, 0, 0.25], yaw_deg: 180 },
    ],
    lighting: {
      ambient: '#8a95a3',
      sun_azimuth_deg: 90,
      interior: lights.map(([x, z]) => ({
        position: [x, CEILING - 0.4, z],
        color: '#f3f7ff',
        intensity: 16,
        distance: 16,
      })),
    },
  };
  const navmesh = b.navmesh(BOUNDS, 0.5, 0.3, anchorsOf(manifest, [ownerDesk.seat]));
  return { manifest, scene: b.build(), navmesh };
}
