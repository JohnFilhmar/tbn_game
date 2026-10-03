import { PackBuilder } from '#game/props/builder.ts';
import { BASE_MATERIALS, doorFrame } from '#game/props/furniture.ts';
import { LayoutBuilder, spot, type PackResult } from '../manifest.ts';

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

  const layout = new LayoutBuilder(3);
  layout.add('shelf', 0, -2, 90, { width: 10, depth: 1 });
  layout.add('shelf', 0, 2, 90, { width: 10, depth: 1 });
  layout.add('shelf', -11.3, -1, 0, { width: 10, depth: 1 });
  layout.add('shelf', 11.3, -3, 180, { width: 6, depth: 1 });
  for (const x of [-8, -6, -4, -2]) layout.add('desk', x, -7, 180);
  layout.add('zone_rug', -5, -6.5, 0, { width: 8, depth: 3, zone: 1 });
  for (const x of [2, 4, 6, 8]) layout.add('desk', x, -7, 180);
  layout.add('zone_rug', 5, -6.5, 0, { width: 8, depth: 3, zone: 2 });
  for (const x of [0.5, 2.5, 4.5, 6.5]) layout.add('desk', x, 7, 0);
  layout.add('zone_rug', 3.5, 6.5, 0, { width: 8, depth: 3, zone: 3 });
  for (const z of [2, 3.5, 5, 6.5]) layout.add('desk', 11.3, z, 90);
  layout.add('zone_rug', 10.5, 4.25, 0, { width: 3, depth: 6.5, zone: 4 });
  layout.add('computer_desk', -2.5, 5.4, 180);
  layout.add('pallet', -8.5, 3.5, 180);
  layout.add('pallet', -7.1, 3.5, 15);
  layout.add('pallet', -10.3, 5.8, 0);
  layout.add('forklift', 8.5, -0.5, 90);
  // The things to use: high bay lamps, a switch by the door and coffee by the owner's desk.
  for (const [x, z] of [
    [-6, -4.5],
    [6, -4.5],
    [-6, 4.5],
    [6, 4.5],
    [0, 0],
  ] as const) {
    layout.add('lamp', x, z, 0, { variant: 'high_bay' });
  }
  layout.add('light_switch', -6, 7.85, 180);
  layout.add('coffee_set', -4.5, 7.55, 180);
  // The company's objects that suit a warehouse: the inbox, the clock, the radio and the exit.
  layout.add('inbox_tray', -3.05, 5.4, 180);
  layout.add('wall_clock', 0, -7.85, 0);
  layout.add('radio', -5.6, 7.85, 180);
  layout.add('exit_sign', -8, 7.85, 180);

  return {
    manifest: {
      name: 'warehouse',
      title: 'Warehouse',
      scale: 1,
      bounds: BOUNDS,
      ceiling: CEILING,
      spawn: { position: [-5, 0, 6.25], yaw_deg: 180 },
      entry: { position: [-8, 0, 7.25], yaw_deg: 180 },
      exit: { position: [-8, 0, 7.25], yaw_deg: 0 },
      waiting: [
        { position: [-7.5, 0, 0.25], yaw_deg: 90 },
        { position: [7, 0, 0.25], yaw_deg: 270 },
        { position: [0, 0, -0.25], yaw_deg: 0 },
        { position: [0, 0, 0.25], yaw_deg: 180 },
      ],
      spots: [spot('stretch', [5, 4.5], [5, 8]), spot('stretch', [-6, -4.5], [-6, -8])],
      blocks: b.footprints,
      lighting: {
        ambient: '#8a95a3',
        sun_azimuth_deg: 90,
      },
      default_layout: layout.placements,
    },
    scene: b.build(),
  };
}
