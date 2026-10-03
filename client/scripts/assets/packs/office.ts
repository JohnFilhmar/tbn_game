import {
  BASE_MATERIALS,
  computerDesk,
  desk,
  doorFrame,
  lamp,
  partition,
  plant,
  tableSeats,
  waterCooler,
  whiteboard,
  windowPane,
} from '../furniture.ts';
import { PackBuilder } from '../kit.ts';
import { anchorsOf, type PackResult, type Zone } from '../manifest.ts';

const BOUNDS = { min_x: -11, max_x: 11, min_z: -8, max_z: 8 };
const CEILING = 3;

/** An island of four desks, two facing two across a partition. */
function island(b: PackBuilder, cx: number, cz: number, name: string, label: string): Zone {
  const desks = [
    desk(b, [cx - 1, cz - 0.85], 0),
    desk(b, [cx + 1, cz - 0.85], 0),
    desk(b, [cx - 1, cz + 0.85], 180),
    desk(b, [cx + 1, cz + 0.85], 180),
  ];
  partition(b, [cx - 1.75, cz], [cx + 1.75, cz]);
  partition(b, [cx - 1.75, cz - 1.2], [cx - 1.75, cz + 1.2]);
  partition(b, [cx + 1.75, cz - 1.2], [cx + 1.75, cz + 1.2]);
  lamp(b, [cx, cz], CEILING);
  return { name, label, desks };
}

/** An open plan office: four islands, a meeting table by the windows, the owner's desk by the door. */
export function buildOffice(): PackResult {
  const b = new PackBuilder({ ...BASE_MATERIALS, floor: '#b9b1a3', wall: '#ece7dd' });
  b.floor('floor', 22, 16);
  b.outerWall('wall', [-11, -8], [11, -8], CEILING);
  b.outerWall('wall', [-11, 8], [-0.9, 8], CEILING);
  b.outerWall('wall', [0.9, 8], [11, 8], CEILING);
  b.outerWall('wall', [-11, -8], [-11, 8], CEILING);
  b.outerWall('wall', [11, -8], [11, 8], CEILING);
  doorFrame(b, [0, 8], 0, 1.8);
  for (const x of [-7.5, -2.5, 2.5, 7.5]) windowPane(b, [x, -7.88], 0, 2);
  for (const z of [-4, 0, 4]) windowPane(b, [10.88, z], 270, 2);
  whiteboard(b, [0, -7.86], 0);

  const zones = [
    island(b, -5.5, -3.25, 'zone_1', 'North west island'),
    island(b, 5.5, -3.25, 'zone_2', 'North east island'),
    island(b, -5.5, 2.75, 'zone_3', 'South west island'),
    island(b, 5.5, 2.75, 'zone_4', 'South east island'),
  ];
  tableSeats(b, [0, -6], 0, [2.4, 1.2]);
  const lights: [number, number][] = [
    [-5.5, -3.25],
    [5.5, -3.25],
    [-5.5, 2.75],
    [5.5, 2.75],
    [0, -6],
    [0, 6],
  ];
  lamp(b, [0, -6], CEILING);
  lamp(b, [0, 6], CEILING);
  for (const corner of [
    [-10.4, -7.4],
    [10.4, -7.4],
    [-10.4, 7.4],
  ] as const) {
    plant(b, [corner[0], corner[1]]);
  }
  waterCooler(b, [9.6, 7.3]);
  const { desk: ownerDesk, computer } = computerDesk(b, [-4.5, 6.4], 180);

  const manifest: PackResult['manifest'] = {
    name: 'office',
    title: 'Office',
    scale: 1,
    bounds: BOUNDS,
    ceiling: CEILING,
    spawn: { position: [2.5, 0, 6.25], yaw_deg: 180 },
    entry: { position: [0, 0, 7.25], yaw_deg: 180 },
    exit: { position: [0, 0, 7.25], yaw_deg: 0 },
    computer,
    zones,
    waiting: [
      { position: [-2.5, 0, -0.25], yaw_deg: 90 },
      { position: [2.5, 0, -0.25], yaw_deg: 270 },
      { position: [0, 0, -1.75], yaw_deg: 0 },
      { position: [0, 0, 1.25], yaw_deg: 180 },
    ],
    lighting: {
      ambient: '#9fb4c8',
      sun_azimuth_deg: 135,
      interior: lights.map(([x, z]) => ({
        position: [x, CEILING - 0.2, z],
        color: '#fff1d6',
        intensity: 7,
        distance: 10,
      })),
    },
  };
  const navmesh = b.navmesh(BOUNDS, 0.5, 0.3, anchorsOf(manifest, [ownerDesk.seat]));
  return { manifest, scene: b.build(), navmesh };
}
