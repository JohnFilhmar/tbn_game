import type { PlayerPose } from '@tbn/contracts';
import { Vector3 } from 'three';
import type { ClipName } from '@/game/assets/characterManifest';
import { turnTowards } from '@/game/assets/geometry';
import { AgentActor, WALK_SPEED } from '@/game/npcs/agentActor';
import type { PathPlanner } from '@/game/world/navmesh';

/** Metres a second a remote walker and runner are drawn at, matching the local character. */
const WALK = 1.6;
const RUN = 3.6;
/** Farther behind than this, the body jumps to the pose instead of walking there. */
const SNAP_DISTANCE = 4;
const TURN_SPEED = 600;

/** How a remote player is drawn: following their poses, wandering offline, or walking out. */
export type RemoteMode = 'online' | 'offline' | 'leaving';

/**
 * One other player's body in this client's world. Online, it walks towards the latest pose the
 * player sent; offline, an agent actor takes over and wanders like any idle agent; leaving, the
 * actor walks it out through the exit. Positions are a fiction of this client.
 */
export class RemoteBody {
  readonly id: string;
  readonly position: Vector3;
  yawDeg: number;
  clip: ClipName = 'idle';
  timeScale = 1;
  private target: PlayerPose;
  private actor: AgentActor | null = null;
  private hasLeft = false;

  constructor(id: string, pose: PlayerPose) {
    this.id = id;
    this.target = pose;
    this.position = new Vector3(pose.x, 0, pose.z);
    this.yawDeg = pose.yaw;
  }

  /** The newest pose the player sent; their body walks there. */
  follow(pose: PlayerPose): void {
    this.target = pose;
    this.actor = null;
  }

  /** The actor that wanders the body while the player is away, made the first time it is asked. */
  wanderer(name: string, planner: PathPlanner): AgentActor {
    if (this.actor === null) {
      this.actor = new AgentActor({
        id: this.id,
        name,
        home: {
          seat: this.position.clone(),
          standing: this.position.clone(),
          yawDeg: this.yawDeg,
          hasDesk: false,
        },
        planner,
        listener: { onActivity: () => undefined, onNarrate: () => undefined },
        from: 'home',
      });
    }
    return this.actor;
  }

  /** True once a leaving body has walked out of the building. */
  get isGone(): boolean {
    return this.actor?.isGone ?? false;
  }

  /** Moves the body `dt` seconds on. */
  tick(dt: number, mode: RemoteMode, name: string, planner: PathPlanner, exit: Vector3): void {
    if (mode === 'online') {
      this.followPose(dt);
      return;
    }
    const actor = this.wanderer(name, planner);
    if (mode === 'leaving' && !this.hasLeft) {
      this.hasLeft = true;
      actor.leave(exit);
    }
    actor.tick(dt);
    this.position.copy(actor.position);
    this.yawDeg = actor.yawDeg;
    this.clip = actor.clip;
    this.timeScale = 1;
  }

  private followPose(dt: number): void {
    const pose = this.target;
    const dx = pose.x - this.position.x;
    const dz = pose.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (pose.seated) {
      this.position.set(pose.x, 0, pose.z);
      this.yawDeg = pose.yaw;
      this.clip = 'work';
      return;
    }
    if (distance > SNAP_DISTANCE) {
      this.position.set(pose.x, 0, pose.z);
    } else if (distance > 0.02) {
      const speed = pose.running ? RUN : WALK;
      const step = Math.min(distance, speed * dt * 1.25);
      this.position.x += (dx / distance) * step;
      this.position.z += (dz / distance) * step;
    }
    const isWalking = pose.moving || distance > 0.15;
    const heading = isWalking && distance > 0.02 ? (Math.atan2(dx, dz) * 180) / Math.PI : pose.yaw;
    this.yawDeg = turnTowards(this.yawDeg, heading, TURN_SPEED * dt);
    this.clip = isWalking ? 'walk' : 'idle';
    this.timeScale = isWalking ? (pose.running ? RUN : WALK) / WALK_SPEED : 1;
  }
}
