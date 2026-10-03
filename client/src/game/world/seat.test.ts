import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PACKS } from '@/game/assets/packs';
import { arrangePack } from '@/game/props/arrangedPack';
import { isSeatedPath, landingBeside, seatPoseOf } from './seat';

describe('the seat', () => {
  it('seats the owner on every route but the world', () => {
    expect(isSeatedPath('/')).toBe(false);
    expect(isSeatedPath('/sign_in')).toBe(true);
    expect(isSeatedPath('/tasks')).toBe(true);
    expect(isSeatedPath('/agents/123/chat')).toBe(true);
  });

  it('puts the eye in front of the office screen, facing it, with the chair behind', () => {
    const pose = seatPoseOf({ position: [-4.5, 1.19, 6.22], yaw_deg: 180, use_radius: 1.9 });
    expect(pose.look.toArray()).toEqual([-4.5, 1.19, 6.22]);
    expect(pose.eye.x).toBeCloseTo(-4.5);
    expect(pose.eye.y).toBeCloseTo(1.19);
    expect(pose.eye.z).toBeCloseTo(6.77);
    expect(pose.chair.x).toBeCloseTo(-4.5);
    expect(pose.chair.y).toBe(0);
    expect(pose.chair.z).toBeCloseTo(7.35);
    expect(pose.yawDeg).toBe(180);
  });

  it('keeps the office chair inside the room', () => {
    const office = arrangePack(PACKS.office, null);
    expect(seatPoseOf(office.computer).chair.z).toBeLessThan(office.manifest.bounds.max_z);
  });

  it('lands a teleport beside the target, on the side the owner comes from', () => {
    const landing = landingBeside(new Vector3(0, 0, 0), new Vector3(10, 0, 0));
    expect(landing.toArray()).toEqual([1.2, 0, 0]);
    const onTop = landingBeside(new Vector3(2, 0, 3), new Vector3(2, 0, 3), 1);
    expect(onTop.toArray()).toEqual([2, 0, 4]);
  });
});
