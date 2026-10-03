import {
  BASE_MATERIALS,
  computerDesk,
  counter,
  desk,
  doorFrame,
  fence,
  fridge,
  lamp,
  lowTable,
  plant,
  rug,
  sofa,
  tableSeats,
  tree,
  windowPane,
} from '../furniture.ts';
import { PackBuilder } from '../kit.ts';
import { anchorsOf, type PackResult } from '../manifest.ts';

const BOUNDS = { min_x: -9, max_x: 9, min_z: -7, max_z: 7 };
const CEILING = 2.8;

/** A house: a study, a kitchen, a living room and a garden, each a department's room. */
export function buildHome(): PackResult {
  const b = new PackBuilder({ ...BASE_MATERIALS, floor: '#c9a97c', wall: '#f1ece2' });
  b.floor('floor', 18, 7, [0, 0, -3.5]);
  b.floor('floor', 9, 7, [-4.5, 0, 3.5]);
  b.floor('grass', 9, 7, [4.5, 0, 3.5]);
  rug(b, [-4.5, 3.6], [3.2, 2.4], 'fabric');

  b.outerWall('wall', [-9, -7], [9, -7], CEILING);
  b.outerWall('wall', [-9, -7], [-9, 7], CEILING);
  b.outerWall('wall', [9, -7], [9, 0], CEILING);
  b.outerWall('wall', [-9, 7], [-5.2, 7], CEILING);
  b.outerWall('wall', [-3.8, 7], [0, 7], CEILING);
  b.wall('wall', [0, 0], [0, 2.3], CEILING);
  b.wall('wall', [0, 3.7], [0, 7], CEILING);
  b.wall('wall', [0, -7], [0, -4.7], CEILING);
  b.wall('wall', [0, -3.3], [0, 0], CEILING);
  b.wall('wall', [-9, 0], [-3.2, 0], CEILING);
  b.wall('wall', [-1.8, 0], [0, 0], CEILING);
  b.wall('wall', [0, 0], [6.3, 0], CEILING);
  b.wall('wall', [7.7, 0], [9, 0], CEILING);
  fence(b, [9, 0], [9, 7]);
  fence(b, [0, 7], [9, 7]);
  doorFrame(b, [-4.5, 7], 0, 1.4);
  doorFrame(b, [0, 3], 90, 1.4);
  doorFrame(b, [7, 0], 0, 1.4);
  doorFrame(b, [0, -4], 90, 1.4);
  doorFrame(b, [-2.5, 0], 0, 1.4);
  windowPane(b, [-5, -6.88], 0, 1.8);
  windowPane(b, [4.5, -6.88], 0, 1.8);
  windowPane(b, [-8.88, 3.5], 90, 1.8);

  const study = {
    name: 'zone_1',
    label: 'Study',
    desks: [
      desk(b, [-8.4, -5.5], 270),
      desk(b, [-8.4, -3], 270),
      desk(b, [-5.5, -6.4], 180),
      desk(b, [-3, -6.4], 180),
    ],
  };
  const kitchen = {
    name: 'zone_2',
    label: 'Kitchen table',
    desks: tableSeats(b, [4.5, -3.3], 0, [2, 1.2]),
  };
  counter(b, [4.5, -6.6], 90, 7);
  fridge(b, [8.5, -6.55], 0);
  const living = {
    name: 'zone_3',
    label: 'Living room',
    desks: tableSeats(b, [-6, 2.5], 0, [1.8, 1]),
  };
  sofa(b, [-2.5, 6.2], 180);
  lowTable(b, [-2.5, 4.6], 0, [1, 0.5]);
  const garden = {
    name: 'zone_4',
    label: 'Garden',
    desks: tableSeats(b, [4.5, 3.5], 0, [1.6, 1.6], 'metal'),
  };
  tree(b, [8, 6]);
  tree(b, [1.5, 6.2], 2.2);
  plant(b, [1, 1]);
  plant(b, [-8.4, 6.4]);
  const { desk: ownerDesk, computer } = computerDesk(b, [-8.4, 4.6], 270);
  const lamps: [number, number][] = [
    [-4.5, -3.5],
    [4.5, -3.5],
    [-4.5, 3.5],
  ];
  for (const at of lamps) lamp(b, at, CEILING);

  const manifest: PackResult['manifest'] = {
    name: 'home',
    title: 'Home',
    scale: 1,
    bounds: BOUNDS,
    ceiling: CEILING,
    spawn: { position: [-4.5, 0, 5.25], yaw_deg: 180 },
    entry: { position: [-4.5, 0, 6.25], yaw_deg: 180 },
    exit: { position: [-4.5, 0, 6.25], yaw_deg: 0 },
    computer,
    zones: [study, kitchen, living, garden],
    waiting: [
      { position: [-2.5, 0, -1.25], yaw_deg: 0 },
      { position: [-2.5, 0, 1.25], yaw_deg: 180 },
      { position: [2.5, 0, -1.25], yaw_deg: 0 },
      { position: [2.5, 0, 1.25], yaw_deg: 180 },
    ],
    lighting: {
      ambient: '#b8c4cc',
      sun_azimuth_deg: 210,
      interior: [
        { position: [-4.5, CEILING - 0.2, -3.5], color: '#fff1d6', intensity: 6, distance: 8 },
        { position: [4.5, CEILING - 0.2, -3.5], color: '#fff1d6', intensity: 6, distance: 8 },
        { position: [-4.5, CEILING - 0.2, 3.5], color: '#fff1d6', intensity: 6, distance: 8 },
        { position: [4.5, 2.4, 3.5], color: '#ffd9a0', intensity: 4, distance: 7 },
      ],
    },
  };
  const navmesh = b.navmesh(BOUNDS, 0.5, 0.3, anchorsOf(manifest, [ownerDesk.seat]));
  return { manifest, scene: b.build(), navmesh };
}
