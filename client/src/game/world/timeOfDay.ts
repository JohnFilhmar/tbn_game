import type { TimeOfDay } from '@tbn/contracts';
import { Color } from 'three';

/** The hour each fixed time of day stands for. */
export const FIXED_HOURS: Record<Exclude<TimeOfDay, 'clock'>, number> = {
  morning: 8,
  noon: 12,
  afternoon: 17,
  night: 22,
};

const SUNRISE = 6;
const SUNSET = 19;

function partsOf(now: Date, timeZone: string | undefined): Intl.DateTimeFormatPart[] {
  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  };
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).formatToParts(now);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).formatToParts(now);
  }
}

/** The hour of the day in `timeZone`, with minutes as a fraction; the device's zone when invalid. */
export function clockHour(now: Date, timeZone: string): number {
  const parts = partsOf(now, timeZone);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return (hour % 24) + minute / 60;
}

/** The hour the world shows: the fixed one of the mode, or the owner's clock. */
export function hourOf(timeOfDay: TimeOfDay, now: Date, timeZone: string): number {
  return timeOfDay === 'clock' ? clockHour(now, timeZone) : FIXED_HOURS[timeOfDay];
}

/** How the sky and the sun look at an hour. Colours are hex strings for the lights. */
export interface DayLight {
  /** Degrees above the horizon; negative at night. */
  sunElevationDeg: number;
  /** The key light: the sun by day, a faint moon by night, from the opposite side. */
  keyElevationDeg: number;
  keyAzimuthOffsetDeg: number;
  keyColor: string;
  keyIntensity: number;
  skyColor: string;
  horizonColor: string;
  groundColor: string;
  ambientIntensity: number;
  /** Interior lights come on from dusk. */
  interiorOn: boolean;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(from: string, to: string, amount: number): string {
  return `#${new Color(from).lerp(new Color(to), clamp01(amount)).getHexString()}`;
}

const NIGHT_SKY = '#0d1330';
const DUSK_SKY = '#f2a365';
const DAY_SKY = '#8fbbe6';
const NIGHT_HORIZON = '#1a2240';
const DUSK_HORIZON = '#ffd0a0';
const DAY_HORIZON = '#dceaf7';

/** The sun's elevation at an hour: a sine arc from sunrise to sunset, below the horizon at night. */
export function sunElevationAt(hour: number): number {
  const day = (hour - SUNRISE) / (SUNSET - SUNRISE);
  if (day <= 0 || day >= 1) return -15;
  return Math.sin(day * Math.PI) * 65;
}

/** The lighting of an hour. */
export function lightingAt(hour: number): DayLight {
  const elevation = sunElevationAt(hour);
  const isNight = elevation <= 0;
  const twilight = clamp01((elevation + 8) / 8);
  const dayness = clamp01(elevation / 20);
  const skyColor =
    elevation < 0 ? mix(NIGHT_SKY, DUSK_SKY, twilight) : mix(DUSK_SKY, DAY_SKY, dayness);
  const horizonColor =
    elevation < 0
      ? mix(NIGHT_HORIZON, DUSK_HORIZON, twilight)
      : mix(DUSK_HORIZON, DAY_HORIZON, dayness);
  const warmth = clamp01(elevation / 25);
  return {
    sunElevationDeg: elevation,
    keyElevationDeg: isNight ? 40 : elevation,
    keyAzimuthOffsetDeg: isNight ? 180 : 0,
    keyColor: isNight ? '#9fb4ff' : mix('#ff9a4a', '#fff3e0', warmth),
    keyIntensity: isNight ? 0.35 : 0.6 + 2.2 * clamp01(elevation / 60),
    skyColor,
    horizonColor,
    groundColor: mix('#1b1f2a', '#6b5f4e', clamp01((elevation + 8) / 28)),
    ambientIntensity: 0.15 + 0.55 * clamp01((elevation + 8) / 30),
    interiorOn: elevation < 10,
  };
}
