import { describe, expect, it } from 'vitest';
import {
  appearanceOf,
  defaultAppearance,
  isEmptyAppearance,
  ownerAppearanceOf,
  resolveAppearance,
} from './appearance';
import { CHARACTER_SET } from './characters';

describe('resolving an appearance', () => {
  it('turns parts and colours into files, ignoring what the set does not have', () => {
    const resolved = resolveAppearance(CHARACTER_SET, {
      body: 'slim',
      hair: 'bun',
      outfit: 'no_such_outfit',
      accessory: 'glasses',
      colors: { top: '#123456', nothing: '#000000' },
    });
    expect(resolved.body.name).toBe('slim');
    expect(resolved.body.url).toMatch(/body_slim.*\.glb$/);
    expect(resolved.parts.map((part) => [part.kind, part.name, part.attach])).toEqual([
      ['hair', 'bun', 'head'],
      ['accessory', 'glasses', 'head'],
    ]);
    expect(resolved.colors.top).toBe('#123456');
    expect(resolved.colors.skin).toBe(CHARACTER_SET.manifest.palette.skin);
    expect(resolved.key).toContain('hair=bun');
  });

  it('falls back to the regular body for an unknown one', () => {
    expect(resolveAppearance(CHARACTER_SET, { body: 'giant' }).body.name).toBe('regular');
    expect(resolveAppearance(CHARACTER_SET, {}).parts).toEqual([]);
  });

  it('derives the same look from the same id, and different looks from different ids', () => {
    const first = defaultAppearance(CHARACTER_SET, 'agent-1');
    expect(defaultAppearance(CHARACTER_SET, 'agent-1')).toEqual(first);
    const looks = new Set(
      Array.from(
        { length: 12 },
        (_, index) =>
          resolveAppearance(CHARACTER_SET, defaultAppearance(CHARACTER_SET, `agent-${index}`)).key,
      ),
    );
    expect(looks.size).toBeGreaterThan(6);
    expect(resolveAppearance(CHARACTER_SET, first).parts.length).toBeGreaterThan(0);
  });

  it('uses the derived look only for an empty appearance', () => {
    expect(isEmptyAppearance({})).toBe(true);
    expect(isEmptyAppearance({ colors: {} })).toBe(true);
    expect(isEmptyAppearance({ hair: 'short' })).toBe(false);
    const chosen = { hair: 'long' };
    expect(appearanceOf(CHARACTER_SET, 'agent-1', chosen)).toBe(chosen);
    expect(appearanceOf(CHARACTER_SET, 'agent-1', {})).toEqual(
      defaultAppearance(CHARACTER_SET, 'agent-1'),
    );
    expect(ownerAppearanceOf(undefined).body).toBe('regular');
    expect(ownerAppearanceOf({ body: 'broad' })).toEqual({ body: 'broad' });
  });
});
