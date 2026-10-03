import type { WorldLayout, WorldPlacement } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { PACKS } from '@/game/assets/packs';
import { newPlacement } from '@/game/build/draft';
import { arrangePack } from './arrangedPack';
import { themeColor } from './themes';

const office = PACKS.office;

function saved(placements: WorldPlacement[]): WorldLayout {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    environment: 'office',
    theme: { floor: '#123456' },
    placements,
    revision: 3,
    updated_at: new Date(0).toISOString(),
  };
}

describe('an arranged pack', () => {
  it('makes four zones of four desks, the computer and the spots from the default', () => {
    const arranged = arrangePack(office, null);
    expect(arranged.revision).toBe(0);
    expect(arranged.zones.map((zone) => zone.desks.length)).toEqual([4, 4, 4, 4]);
    expect(arranged.zones.map((zone) => zone.name)).toEqual([
      'zone_1',
      'zone_2',
      'zone_3',
      'zone_4',
    ]);
    expect(arranged.computer.position[0]).toBeCloseTo(-4.5);
    expect(arranged.spots.some((spot) => spot.kind === 'water')).toBe(true);
  });

  it('takes the saved layout and its theme, and moves a desk out of its zone with its rug', () => {
    const moved = office.manifest.default_layout.map((one, index) =>
      index === 0 ? { ...one, x: 0, z: 3.5 } : one,
    );
    const arranged = arrangePack(office, saved(moved));
    expect(arranged.revision).toBe(3);
    expect(arranged.theme).toEqual({ floor: '#123456' });
    expect(arranged.zones[0]?.desks).toHaveLength(3);
  });

  it('falls back to the default when a saved layout lost its computer', () => {
    const broken = office.manifest.default_layout.filter((one) => one.kind !== 'computer_desk');
    const arranged = arrangePack(office, saved(broken));
    expect(arranged.placements).toBe(office.manifest.default_layout);
    expect(arranged.revision).toBe(3);
  });

  it('leaves out a spot nobody can reach, such as a plant facing a wall', () => {
    const facingWall = newPlacement('plant', 0, -7.4, '00000000-0000-4000-8000-0000000000bb');
    const turnedAway = { ...facingWall, yaw_deg: 180 };
    const withPlant = arrangePack(office, saved([...office.manifest.default_layout, turnedAway]));
    const without = arrangePack(office, null);
    expect(withPlant.spots).toHaveLength(without.spots.length);
  });

  it('colours a slot by the theme, else by what the pack made it', () => {
    expect(themeColor({ floor: '#000000' }, 'floor', '#ffffff')).toBe('#000000');
    expect(themeColor({}, 'floor', '#ffffff')).toBe('#ffffff');
    expect(themeColor({}, 'screen')).toBe('#1d2a3a');
  });
});
