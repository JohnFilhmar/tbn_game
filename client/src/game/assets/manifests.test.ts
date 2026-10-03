import { describe, expect, it } from 'vitest';
import { CharacterManifestSchema } from './characterManifest';
import { CHARACTER_SET, bodyNames, partNames } from './characters';
import { PackManifestSchema } from './packManifest';
import { PACKS } from './packs';

describe('the shipped manifests', () => {
  it('ship the three packs with their files', () => {
    for (const name of ['office', 'home', 'warehouse'] as const) {
      const pack = PACKS[name];
      expect(pack.manifest.name).toBe(name);
      expect(pack.sceneUrl).toMatch(/scene.*\.glb$/);
      expect(pack.navmeshUrl).toMatch(/navmesh.*\.glb$/);
      expect(pack.manifest.zones).toHaveLength(4);
      for (const zone of pack.manifest.zones) expect(zone.desks).toHaveLength(4);
      expect(pack.manifest.waiting.length).toBeGreaterThan(0);
      expect(pack.manifest.computer.use_radius).toBeGreaterThan(0);
    }
  });

  it('reject a pack without an anchor the world needs', () => {
    const { manifest } = PACKS.office;
    expect(PackManifestSchema.safeParse({ ...manifest, zones: [] }).success).toBe(false);
    expect(PackManifestSchema.safeParse({ ...manifest, computer: undefined }).success).toBe(false);
    expect(PackManifestSchema.safeParse({ ...manifest, extra: 1 }).success).toBe(false);
    expect(
      PackManifestSchema.safeParse({ ...manifest, spawn: { position: [0, 0], yaw_deg: 0 } })
        .success,
    ).toBe(false);
  });

  it('ship the character set with every body, part and clip', () => {
    const { manifest } = CHARACTER_SET;
    expect(bodyNames(CHARACTER_SET)[0]).toBe('regular');
    expect(bodyNames(CHARACTER_SET)).toEqual(expect.arrayContaining(['slim', 'broad']));
    expect(manifest.clips).toEqual(['idle', 'walk', 'work', 'sit', 'wave']);
    expect(partNames(CHARACTER_SET, 'hair')).toContain('short');
    expect(partNames(CHARACTER_SET, 'outfit')).toContain('vest');
    expect(partNames(CHARACTER_SET, 'accessory')).toContain('glasses');
    expect(CHARACTER_SET.urlOf(manifest.bodies['regular']?.file ?? '')).toMatch(/\.glb$/);
    expect(() => CHARACTER_SET.urlOf('missing.glb')).toThrow('not shipped');
  });

  it('rejects a character set without the regular body', () => {
    const { manifest } = CHARACTER_SET;
    const { regular, ...others } = manifest.bodies;
    expect(regular).toBeDefined();
    expect(CharacterManifestSchema.safeParse({ ...manifest, bodies: others }).success).toBe(false);
  });
});
