import { PackBuilder } from '#game/props/builder.ts';
import { BASE_MATERIALS, doorFrame, fence, windowPane } from '#game/props/furniture.ts';
import { LayoutBuilder, spot, type PackResult } from '../manifest.ts';

const BOUNDS = { min_x: -9, max_x: 9, min_z: -7, max_z: 7 };
const CEILING = 2.8;

/** A house: a study, a kitchen, a living room and a garden, each a department's room. */
export function buildHome(): PackResult {
  const b = new PackBuilder({ ...BASE_MATERIALS, floor: '#c9a97c', wall: '#f1ece2' });
  b.floor('floor', 18, 7, [0, 0, -3.5]);
  b.floor('floor', 9, 7, [-4.5, 0, 3.5]);
  b.floor('grass', 9, 7, [4.5, 0, 3.5]);

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

  const layout = new LayoutBuilder(2);
  // The study.
  layout.add('desk', -8.4, -5.5, 270);
  layout.add('desk', -8.4, -3, 270);
  layout.add('desk', -5.5, -6.4, 180);
  layout.add('desk', -3, -6.4, 180);
  layout.add('zone_rug', -4.5, -3.5, 0, { width: 9, depth: 7, zone: 1 });
  // The kitchen.
  layout.add('table', 4.5, -3.3, 0, { width: 2, depth: 1.2 });
  layout.add('counter', 4.5, -6.6, 90, { width: 7 });
  layout.add('fridge', 8.5, -6.55, 0);
  layout.add('zone_rug', 4.5, -3.5, 0, { width: 9, depth: 7, zone: 2 });
  // The living room.
  layout.add('rug', -4.5, 3.6, 0, { width: 3.2, depth: 2.4, variant: 'fabric' });
  layout.add('table', -6, 2.5, 0, { width: 1.8, depth: 1 });
  layout.add('sofa', -2.5, 6.2, 180, { width: 2 });
  layout.add('low_table', -2.5, 4.6, 0, { width: 1, depth: 0.5 });
  layout.add('plant', -8.4, 6.4, 90);
  layout.add('computer_desk', -8.4, 4.6, 270);
  layout.add('zone_rug', -4.5, 3.5, 0, { width: 9, depth: 7, zone: 3 });
  // The garden.
  layout.add('table', 4.5, 3.5, 0, { width: 1.6, depth: 1.6, variant: 'metal' });
  layout.add('tree', 8, 6, 180, { variant: 'tall' });
  layout.add('tree', 1.5, 6.2, 180, { variant: 'small' });
  layout.add('plant', 1, 1, 90);
  layout.add('zone_rug', 4.5, 3.5, 0, { width: 9, depth: 7, zone: 4 });
  // The things to use: a lamp in each room, blinds, a switch by the door, coffee in the kitchen
  // and grass in the garden.
  for (const [x, z] of [
    [-4.5, -3.5],
    [4.5, -3.5],
    [-4.5, 3.5],
  ] as const) {
    layout.add('lamp', x, z, 0, { variant: 'panel' });
  }
  layout.add('blinds', -5, -6.78, 0, { width: 1.8, depth: 0.08 });
  layout.add('blinds', 4.5, -6.78, 0, { width: 1.8, depth: 0.08 });
  layout.add('blinds', -8.78, 3.5, 90, { width: 1.8, depth: 0.08 });
  layout.add('light_switch', -3.3, 6.9, 180);
  layout.add('coffee_set', 8.6, -2, 270);
  layout.add('grass_patch', 7.2, 2.4, 180, { width: 1.6, depth: 1.6 });
  layout.add('grass_patch', 2.6, 5.2, 180, { width: 1.6, depth: 1.6 });
  // The company's objects, at home size: the inbox on the desk, reports over the study desks,
  // the clock and the radio in the kitchen, trophies in the living room, a beanbag, and the
  // exit sign over the front door.
  layout.add('inbox_tray', -8.4, 5.1, 270);
  layout.add('cork_board', -8.9, -4.25, 90);
  layout.add('wall_clock', 7, -6.9, 0);
  layout.add('radio', 8.9, -4, 270);
  layout.add('trophy_shelf', -8.9, 6, 90);
  layout.add('beanbag', -0.9, 1.1, 270);
  layout.add('exit_sign', -4.5, 6.9, 180);

  return {
    manifest: {
      name: 'home',
      title: 'Home',
      scale: 1,
      bounds: BOUNDS,
      ceiling: CEILING,
      spawn: { position: [-4.5, 0, 5.25], yaw_deg: 180 },
      entry: { position: [-4.5, 0, 6.25], yaw_deg: 180 },
      exit: { position: [-4.5, 0, 6.25], yaw_deg: 0 },
      waiting: [
        { position: [-2.5, 0, -1.25], yaw_deg: 0 },
        { position: [-2.5, 0, 1.25], yaw_deg: 180 },
        { position: [2.5, 0, -1.25], yaw_deg: 0 },
        { position: [2.5, 0, 1.25], yaw_deg: 180 },
      ],
      spots: [spot('stretch', [-4.5, -3], [-4.5, -7])],
      blocks: b.footprints,
      lighting: {
        ambient: '#b8c4cc',
        sun_azimuth_deg: 210,
      },
      default_layout: layout.placements,
    },
    scene: b.build(),
  };
}
