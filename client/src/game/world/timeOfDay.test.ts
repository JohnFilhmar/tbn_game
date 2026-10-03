import { describe, expect, it } from 'vitest';
import { clockHour, hourOf, lightingAt, sunElevationAt } from './timeOfDay';

describe('the time of day', () => {
  it('maps the fixed modes to their hours and the clock to the owner zone', () => {
    const noonUtc = new Date('2026-10-02T12:30:00.000Z');
    expect(hourOf('morning', noonUtc, 'UTC')).toBe(8);
    expect(hourOf('noon', noonUtc, 'UTC')).toBe(12);
    expect(hourOf('afternoon', noonUtc, 'UTC')).toBe(17);
    expect(hourOf('night', noonUtc, 'UTC')).toBe(22);
    expect(hourOf('clock', noonUtc, 'UTC')).toBe(12.5);
    expect(hourOf('clock', noonUtc, 'Asia/Tokyo')).toBe(21.5);
    expect(clockHour(new Date('2026-10-02T23:45:00.000Z'), 'Europe/Berlin')).toBe(1.75);
  });

  it('falls back to the device zone for a zone it does not know', () => {
    const now = new Date('2026-10-02T12:30:00.000Z');
    expect(clockHour(now, 'Nowhere/Invalid')).toBe(clockHour(now, 'UTC'));
  });

  it('raises the sun from sunrise to sunset and keeps it down at night', () => {
    expect(sunElevationAt(6)).toBeLessThan(0);
    expect(sunElevationAt(8)).toBeGreaterThan(0);
    expect(sunElevationAt(12.5)).toBeGreaterThan(60);
    expect(sunElevationAt(17)).toBeGreaterThan(sunElevationAt(18.5));
    expect(sunElevationAt(22)).toBeLessThan(0);
  });

  it('lights the interior from dusk and gives the night a moon', () => {
    const noon = lightingAt(12);
    expect(noon.interiorOn).toBe(false);
    expect(noon.keyIntensity).toBeGreaterThan(2);
    expect(noon.keyAzimuthOffsetDeg).toBe(0);
    const evening = lightingAt(18.5);
    expect(evening.interiorOn).toBe(true);
    expect(evening.sunElevationDeg).toBeGreaterThan(0);
    const night = lightingAt(22);
    expect(night.interiorOn).toBe(true);
    expect(night.keyAzimuthOffsetDeg).toBe(180);
    expect(night.keyIntensity).toBeLessThan(0.5);
    expect(night.ambientIntensity).toBeLessThan(noon.ambientIntensity);
    expect(night.skyColor).not.toBe(noon.skyColor);
  });
});
