import { Vector3 } from 'three';
import type { ClipName } from '@/game/assets/characterManifest';
import { distanceXz, forwardOf, turnTowards, yawTowards } from '@/game/assets/geometry';
import type { EffectKind } from '@/game/props/interactions';
import type { PathPlanner } from '@/game/world/navmesh';

/** What an agent is doing in the world. */
export type Activity =
  | 'at_desk'
  | 'walking'
  | 'working'
  | 'handing_off'
  | 'returning'
  | 'arriving'
  | 'leaving'
  | 'gone'
  | 'wandering'
  | 'talking';

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
  /** The prop the agent uses gives off a burst, in front of where it stands. */
  onEffect?: (kind: EffectKind, at: Vector3, yawDeg: number) => void;
}

/** Where an idle agent goes, which way it faces there, what it plays and for how long. */
export interface WanderTarget {
  position: Vector3;
  yawDeg: number;
  clip: ClipName;
  seconds: number;
  /** What the prop there gives off while the agent uses it. */
  effect?: EffectKind;
  /** Where the agent sits for the clip, when the spot is sat on. */
  seat?: Vector3;
}

/** A step of the queue; `isWander` marks the steps any real work drops. */
type Step = (
  | { kind: 'walk'; to: Vector3; activity: Activity; narration?: string }
  | {
      kind: 'play';
      clip: ClipName;
      seconds: number;
      activity: Activity;
      faceDeg?: number;
      effect?: EffectKind;
      seat?: Vector3;
    }
  | { kind: 'sit' }
  | { kind: 'stand' }
  | { kind: 'settle' }
  | { kind: 'vanish'; narration?: string }
) & { isWander?: boolean };

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
  /** Plans the walks; the world hands over a new one when the layout changes. */
  planner: PathPlanner;
  private readonly listener: ActorListener;
  private queue: Step[] = [];
  private path: Vector3[] = [];
  private timer = 0;
  private isWorking = false;
  private isSeated = false;
  private hasLeaveQueued = false;
  /** True while the step being played is part of a wander. */
  private isInWander = false;
  /** Where the agent stood before it sat on a seat, to step back to when the clip ends. */
  private standBackTo: Vector3 | null = null;
  private isTalking = false;

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

  /** True when the agent is free to wander: idle, standing at home, with nothing to do. */
  get isIdle(): boolean {
    return (
      this.activity === 'at_desk' &&
      !this.isWorking &&
      !this.isTalking &&
      !this.hasLeaveQueued &&
      this.queue.length === 0 &&
      this.path.length === 0 &&
      this.timer <= 0
    );
  }

  /** Walks to a spot, plays its clip there, and walks home; any real work cuts it short. */
  wander(target: WanderTarget, narration?: string): void {
    this.queue.push(
      { kind: 'walk', to: target.position, activity: 'wandering', narration, isWander: true },
      {
        kind: 'play',
        clip: target.clip,
        seconds: target.seconds,
        activity: 'wandering',
        faceDeg: target.yawDeg,
        effect: target.effect,
        seat: target.seat,
        isWander: true,
      },
      { kind: 'walk', to: this.home.standing, activity: 'wandering', isWander: true },
      { kind: 'settle', isWander: true },
    );
  }

  /** Plays a clip where the agent stands, facing `faceDeg` when given; real work cuts it short. */
  fidget(clip: ClipName, seconds: number, faceDeg?: number): void {
    this.queue.push(
      { kind: 'play', clip, seconds, activity: 'wandering', faceDeg, isWander: true },
      { kind: 'settle', isWander: true },
    );
  }

  /**
   * Stops for the owner: an idle agent drops its wander, turns to `faceDeg`, waves and keeps
   * talking until `endTalk`. A working agent only turns its head to it, so it goes on working.
   */
  startTalk(faceDeg: number): void {
    if (this.isWorking || this.hasLeaveQueued || this.isGone) return;
    this.dropWander();
    this.isTalking = true;
    this.queue.push({ kind: 'play', clip: 'wave', seconds: 1.2, activity: 'talking', faceDeg });
  }

  /** Ends a conversation; the agent then goes back to whatever it rests at. */
  endTalk(): void {
    this.isTalking = false;
  }

  /** Drops every wander step, including the one being played. */
  private dropWander(): void {
    this.queue = this.queue.filter((step) => step.isWander !== true);
    if (this.isInWander) {
      this.isInWander = false;
      this.path = [];
      this.timer = 0;
    }
  }

  /** Starts work: walks to the desk and works there until told otherwise. */
  startWork(narration?: string): void {
    this.dropWander();
    this.isTalking = false;
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
    this.dropWander();
    this.isTalking = false;
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
    this.dropWander();
    this.isTalking = false;
    this.hasLeaveQueued = true;
    this.isWorking = false;
    this.queue = this.queue.filter((step) => step.kind !== 'settle');
    this.queue.push(
      { kind: 'walk', to: exit, activity: 'leaving', narration: `${this.name} leaves.` },
      { kind: 'vanish' },
    );
  }

  /**
   * Gives the agent a new home it walks to, as when the owner moves its desk: after whatever it
   * is doing, it settles at the new desk or stands by it.
   */
  relocate(home: ActorHome): void {
    this.dropWander();
    this.home = home;
    this.isSeated = false;
    this.queue.push({ kind: 'settle' });
  }

  /** Puts the agent at a new home at once, as a pack switch does. */
  moveHome(home: ActorHome): void {
    this.home = home;
    this.queue = [];
    this.path = [];
    this.timer = 0;
    this.isInWander = false;
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
    this.isInWander = step.isWander === true;
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
        if (step.seat !== undefined) {
          this.standBackTo = this.position.clone();
          this.position.copy(step.seat);
        }
        this.setActivity(step.activity);
        if (step.effect !== undefined)
          this.listener.onEffect?.(step.effect, this.position, this.yawDeg);
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
    if (this.standBackTo !== null) {
      this.position.copy(this.standBackTo);
      this.standBackTo = null;
    }
    const next = this.queue.shift();
    if (next !== undefined) {
      this.begin(next);
      return;
    }
    this.isInWander = false;
    if (this.isTalking) {
      this.clip = 'talk';
      this.setActivity('talking');
      return;
    }
    // Nothing queued: the resting state follows the work flag, whenever it changed.
    if (this.hasLeaveQueued) return;
    if (this.isWorking !== (this.activity === 'working') || this.activity === 'talking') {
      this.settle();
    }
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
