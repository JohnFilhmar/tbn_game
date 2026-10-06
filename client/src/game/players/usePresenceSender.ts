import type { EnvironmentName, PlayerPose } from '@tbn/contracts';
import { useEffect } from 'react';
import { localPose } from '@/game/world/livePositions';
import { sendPresence } from '@/lib/realtime/presenceChannel';

/** How often the pose is looked at. */
const SEND_MS = 150;
/** A pose that has not changed is sent again this often, so a new player sees everyone soon. */
const HEARTBEAT_MS = 3_000;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Sends where your character stands to the other players: a few times a second while it changes,
 * and now and then while it stands still. Seated at the computer, it says so.
 *
 * @param isOn - False while signed out: nothing is sent.
 */
export function usePresenceSender(
  environment: EnvironmentName,
  isSeated: boolean,
  isOn: boolean,
): void {
  useEffect(() => {
    if (!isOn) return undefined;
    let lastKey = '';
    let lastAt = 0;
    const timer = window.setInterval(() => {
      if (!localPose.isPlaced) return;
      const pose: PlayerPose = {
        environment,
        x: rounded(localPose.x),
        y: rounded(localPose.y),
        z: rounded(localPose.z),
        yaw: rounded(localPose.yawDeg),
        moving: !isSeated && localPose.isMoving,
        running: !isSeated && localPose.isRunning,
        seated: isSeated,
        act: isSeated ? null : localPose.act,
      };
      const key = JSON.stringify(pose);
      const now = Date.now();
      if (key === lastKey && now - lastAt < HEARTBEAT_MS) return;
      lastKey = key;
      lastAt = now;
      sendPresence(pose);
    }, SEND_MS);
    return () => window.clearInterval(timer);
  }, [environment, isSeated, isOn]);
}
