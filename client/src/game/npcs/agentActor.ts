import { Vector3 } from 'three';
import type { ClipName } from '@/game/assets/characterManifest';
import { distanceXz, forwardOf, turnTowards, yawTowards } from '@/game/assets/geometry';
import type { PathPlanner } from '@/game/world/navmesh';

/** What an agent is doing in the world. */
export type Activity =
  'at_desk' | 'walking' | 'working' | 'handing_off' | 'returning' | 'arriving' | 'leaving' | 'gone';

/** Where an agent lives in the pack: where it sits, where it stands when idle, and how it faces. */
export interface ActorHome {
  seat: Vector3;
  standing: Vector3;
  yawDeg: number;
  /** False at an overflow anchor, where the agent works standing. */
  hasDesk: boolean;
}

/** What the actor tells the HUD. */
export interface ActorListener {
  onActivity: (activity: Activity) => void;
  onNarrate: (text: string) => void;
}

type Step =
  | { kind: 'walk'; to: Vector3; activity: Activity; narration?: string }
  | { kind: 'play'; clip: ClipName; seconds: number; activity: Activity; faceDeg?: number }
  | { kind: 'sit' }
  | { kind: 'stand' }
  | { kind: 'settle' }
  | { kind: 'vanish'; narration?: string };

/** Metres per second, the speed the walk clip was made for. */
export const WALK_SPEED = 1.4;
const TURN_SPEED = 540;
const ARRIVAL = 0.05;

/**
 * One agent in the world: a position, a facing, a clip, and a queue of steps the world events
 * fill. Walks follow a path over the navigation mesh. Nothing here renders; the component that
 * owns the actor copies its position into the scene every frame.
 */
export class AgentActor {
  readonly id: string;
  name: string;
  readonly position: Vector3;
  yawDeg: number;
  clip: ClipName = 'idle';
  activity: Activity = 'at_desk';
  home: ActorHome;
  private readonly planner: PathPlanner;
  private readonly listener: ActorListener;
  private queue: Step[] = [];
  private path: Vector3[] = [];
  private timer = 0;
  private isWorking = false;
  private isSeated = false;
  private hasLeaveQueued = false;

  constructor(options: {
    id: string;
    name: string;
    home: ActorHome;
    planner: PathPlanner;
    listener: ActorListener;
    /** Where the agent starts: at home, or at the entry to walk in. */
    from: 'home' | Vector3;
  }) {
    this.id = options.id;
    this.name = options.name;
    this.home = options.home;
    this.planner = options.planner;
    this.listener = options.listener;
    this.yawDeg = options.home.yawDeg;
    if (options.from === 'home') {
      this.position = options.home.standing.clone();
    } else {
      this.position = options.from.clone();
      this.yawDeg = yawTowards(this.position, options.home.standing);
      this.queue.push(
        {
          kind: 'walk',
          to: this.home.standing,
          activity: 'arriving',
          narration: `${this.name} arrives.`,
        },
        { kind: 'settle' },
      );
    }
  }

  /** The world's own state the actor is in, for the HUD. */
  get isGone(): boolean {
    return this.activity === 'gone';
  }

  private setActivity(activity: Activity): void {
    if (this.activity === activity) return;
    this.activity = activity;
    this.listener.onActivity(activity);
  }

  /** Starts work: walks to the desk and works there until told otherwise. */
  startWork(narration?: string): void {
    this.isWorking = true;
    if (narration !== undefined) this.listener.onNarrate(narration);
  }

  /** Stops work: gets up and stands by the desk. */
  stopWork(narration?: string): void {
    const wasWorking = this.isWorking;
    this.isWorking = false;
    if (narration !== undefined && wasWorking) this.listener.onNarrate(narration);
  }

  /** Walks to another agent, waves, and comes back; `activity` names the errand. */
  visit(other: AgentActor, activity: 'handing_off' | 'returning', narration: string): void {
    const [dx, dz] = forwardOf(other.home.yawDeg + 90);
    const meeting = other.home.standing.clone().add(new Vector3(dx * 0.7, 0, dz * 0.7));
    this.queue.push(
      { kind: 'walk', to: meeting, activity, narration },
      {
        kind: 'play',
        clip: 'wave',
        seconds: 1.2,
        activity,
        faceDeg: yawTowards(meeting, other.home.standing),
      },
      {
        kind: 'walk',
        to: this.home.standing,
        activity: 'returning',
        narration: `${this.name} returns to the desk.`,
      },
      { kind: 'settle' },
    );
  }

  /** True once told to leave, whether or not it is out of the door yet. */
  get isLeaving(): boolean {
    return this.hasLeaveQueued;
  }

  /**
   * Walks out through the exit and disappears, after finishing what it was doing: an intern
   * ended while bringing its result back still brings it back first.
   */
  leave(exit: Vector3): void {
    if (this.hasLeaveQueued || this.isGone) return;
    this.hasLeaveQueued = true;
    this.isWorking = false;
    this.queue = this.queue.filter((step) => step.kind !== 'settle');
    this.queue.push(
      { kind: 'walk', to: exit, activity: 'leaving', narration: `${this.name} leaves.` },
      { kind: 'vanish' },
    );
  }

  /** Puts the agent at a new home at once, as a pack switch does. */
  moveHome(home: ActorHome): void {
    this.home = home;
    this.queue = [];
    this.path = [];
    this.timer = 0;
    this.isSeated = false;
    this.position.copy(home.standing);
    this.yawDeg = home.yawDeg;
    this.settle();
  }

  /** Queues the steps that end in the right place: at the desk when working, standing by it when not. */
  private settle(): void {
    if (this.isWorking) {
      if (this.isSeated) {
        this.queue.push({ kind: 'sit' });
      } else {
        this.queue.push({ kind: 'walk', to: this.home.seat, activity: 'walking' }, { kind: 'sit' });
      }
    } else if (this.isSeated || distanceXz(this.position, this.home.standing) > ARRIVAL) {
      this.queue.push(
        { kind: 'walk', to: this.home.standing, activity: 'walking' },
        { kind: 'stand' },
      );
    } else {
      this.queue.push({ kind: 'stand' });
    }
  }

  private begin(step: Step): void {
    switch (step.kind) {
      case 'walk': {
        this.isSeated = false;
        this.path = this.planner.findPath(this.position, step.to);
        this.clip = 'walk';
        this.setActivity(step.activity);
        if (step.narration !== undefined) this.listener.onNarrate(step.narration);
        return;
      }
      case 'play': {
        this.clip = step.clip;
        this.timer = step.seconds;
        if (step.faceDeg !== undefined) this.yawDeg = step.faceDeg;
        this.setActivity(step.activity);
        return;
      }
      case 'sit': {
        this.position.copy(this.home.seat);
        this.yawDeg = this.home.yawDeg;
        this.isSeated = this.home.hasDesk;
        this.clip = this.home.hasDesk ? 'work' : 'idle';
        this.setActivity('working');
        return;
      }
      case 'stand': {
        this.isSeated = false;
        this.clip = 'idle';
        this.yawDeg = this.home.yawDeg;
        this.setActivity('at_desk');
        return;
      }
      case 'settle': {
        this.settle();
        return;
      }
      case 'vanish': {
        this.clip = 'idle';
        this.setActivity('gone');
      }
    }
  }

  /** Advances the actor by `dt` seconds. */
  tick(dt: number): void {
    if (this.isGone) return;
    if (this.path.length > 0) {
      this.follow(dt);
      return;
    }
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = 0;
    }
    const next = this.queue.shift();
    if (next !== undefined) {
      this.begin(next);
      return;
    }
    // Nothing queued: the resting state follows the work flag, whenever it changed.
    if (!this.hasLeaveQueued && this.isWorking !== (this.activity === 'working')) this.settle();
  }

  private follow(dt: number): void {
    let budget = WALK_SPEED * dt;
    while (budget > 0) {
      const target = this.path[0];
      if (target === undefined) break;
      const distance = distanceXz(this.position, target);
      if (distance <= ARRIVAL) {
        this.position.set(target.x, 0, target.z);
        this.path.shift();
        continue;
      }
      this.yawDeg = turnTowards(this.yawDeg, yawTowards(this.position, target), TURN_SPEED * dt);
      const step = Math.min(budget, distance);
      this.position.x += ((target.x - this.position.x) / distance) * step;
      this.position.z += ((target.z - this.position.z) / distance) * step;
      budget -= step;
    }
    if (this.path.length === 0) {
      this.clip = 'idle';
      const next = this.queue.shift();
      if (next !== undefined) this.begin(next);
    }
  }
}
