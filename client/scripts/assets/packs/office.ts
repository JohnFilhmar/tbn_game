import { PackBuilder } from '#game/props/builder.ts';
import { BASE_MATERIALS, doorFrame, windowPane } from '#game/props/furniture.ts';
import { LayoutBuilder, spot, type PackResult } from '../manifest.ts';

const BOUNDS = { min_x: -11, max_x: 11, min_z: -8, max_z: 8 };
const CEILING = 3;

/** An island of four desks, two facing two across a partition, on its department's zone rug. */
function island(layout: LayoutBuilder, cx: number, cz: number, zone: number): void {
  layout.add('desk', cx - 1, cz - 0.85, 0);
  layout.add('desk', cx + 1, cz - 0.85, 0);
  layout.add('desk', cx - 1, cz + 0.85, 180);
  layout.add('desk', cx + 1, cz + 0.85, 180);
  layout.add('partition', cx, cz, 0, { width: 3.5 });
  layout.add('partition', cx - 1.75, cz, 90, { width: 2.4 });
  layout.add('partition', cx + 1.75, cz, 90, { width: 2.4 });
  layout.add('zone_rug', cx, cz, 0, { width: 4, depth: 4.4, zone });
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
  const northWindows = [-7.5, -2.5, 2.5, 7.5];
  const eastWindows = [-4, 0, 4];
  for (const x of northWindows) windowPane(b, [x, -7.88], 0, 2);
  for (const z of eastWindows) windowPane(b, [10.88, z], 270, 2);

  const layout = new LayoutBuilder(1);
  island(layout, -5.5, -3.25, 1);
  island(layout, 5.5, -3.25, 2);
  island(layout, -5.5, 2.75, 3);
  island(layout, 5.5, 2.75, 4);
  layout.add('table', 0, -6, 0, { width: 2.4, depth: 1.2 });
  layout.add('whiteboard', 0, -7.86, 0);
  layout.add('plant', -10.4, -7.4, 0);
  layout.add('plant', 10.4, -7.4, 0);
  layout.add('plant', -10.4, 7.4, 180);
  layout.add('water_cooler', 9.6, 7.3, 180);
  layout.add('computer_desk', -4.5, 6.4, 180);
  // The things to use: lamps over the islands, blinds at every window, and by the door a light
  // switch, a board, a coffee set and a patch of grass.
  for (const [x, z] of [
    [-5.5, -3.25],
    [5.5, -3.25],
    [-5.5, 2.75],
    [5.5, 2.75],
    [0, -6],
    [0, 6],
  ] as const) {
    layout.add('lamp', x, z, 0, { variant: 'panel' });
  }
  for (const x of northWindows) layout.add('blinds', x, -7.78, 0, { width: 2, depth: 0.08 });
  for (const z of eastWindows) layout.add('blinds', 10.78, z, 270, { width: 2, depth: 0.08 });
  layout.add('light_switch', 1.3, 7.9, 180);
  layout.add('whiteboard', 3.6, 7.86, 180);
  layout.add('coffee_set', 5.8, 7.45, 180);
  layout.add('grass_patch', 7.6, 6.9, 180, { width: 1.6, depth: 1.6 });

  return {
    manifest: {
      name: 'office',
      title: 'Office',
      scale: 1,
      bounds: BOUNDS,
      ceiling: CEILING,
      spawn: { position: [2.5, 0, 6.25], yaw_deg: 180 },
      entry: { position: [0, 0, 7.25], yaw_deg: 180 },
      exit: { position: [0, 0, 7.25], yaw_deg: 0 },
      waiting: [
        { position: [-2.5, 0, -0.25], yaw_deg: 90 },
        { position: [2.5, 0, -0.25], yaw_deg: 270 },
        { position: [0, 0, -1.75], yaw_deg: 0 },
        { position: [0, 0, 1.25], yaw_deg: 180 },
      ],
      spots: [spot('stretch', [0, 4], [0, 8])],
      blocks: b.footprints,
      lighting: {
        ambient: '#9fb4c8',
        sun_azimuth_deg: 135,
      },
      default_layout: layout.placements,
    },
    scene: b.build(),
  };
}
