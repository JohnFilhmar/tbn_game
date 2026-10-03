import { Vector3 } from 'three';
import { distanceXz, forwardOf, yawTowards } from '@/game/assets/geometry';
import type { Spot } from '@/game/assets/packManifest';
import { SPOT_EFFECTS } from '@/game/props/interactions';
import type { AgentActor, WanderTarget } from './agentActor';

/** The quietest and the busiest an idle agent is between two wanders, in seconds. */
const LEAST_REST = 8;
const MOST_REST = 25;
/** How likely a due agent is to go and chat with another idle agent instead of a spot. */
const CHAT_CHANCE = 0.3;
const CHAT_SECONDS = 5;
/** Only a colleague this close is worth walking over to for a chat, in metres. */
const CHAT_REACH = 6;

const GOING: Record<Spot['kind'], string> = {
  water: 'goes for a drink',
  coffee: 'pours a coffee',
  window: 'looks out of the window',
  plant: 'checks on a plant',
  board: 'doodles on the whiteboard',
  grass: 'touches some grass',
  rest: 'sits back for a nap',
  stretch: 'stretches their legs',
  look: 'has a look around',
};

/** A random number generator in [0, 1) that gives the same sequence for the same seed. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the scheduler keeps for one agent. */
interface Rhythm {
  random: () => number;
  /** When the agent next wanders, in seconds of the world clock, once it is idle. */
  dueAt: number | null;
  /** The spot it holds while it wanders there. */
  spot: number | null;
}

/**
 * Sends idle agents on small errands of their own: to a free spot to drink, look out or stretch,
 * or over to another idle agent for a chat. Each agent's randomness is seeded by its id, so the
 * same company wanders the same way, and a spot holds one agent at a time. Real work always wins:
 * the actor drops a wander the moment a task, a hand-off or a departure arrives.
 */
export class WanderScheduler {
  private readonly targets: WanderTarget[];
  private readonly rhythms = new Map<string, Rhythm>();
  private readonly holders = new Map<number, string>();

  constructor(
    private readonly spots: readonly Spot[],
    private readonly narrate: (text: string) => void,
  ) {
    this.targets = spots.map((spot) => ({
      position: new Vector3(spot.position[0], 0, spot.position[2]),
      yawDeg: spot.yaw_deg,
      clip: spot.clip,
      seconds: spot.seconds,
      effect: SPOT_EFFECTS[spot.kind],
      seat: spot.seat === undefined ? undefined : new Vector3(...spot.seat),
    }));
  }

  /** Looks at every actor once; `now` is the world clock in seconds. */
  update(now: number, actors: readonly AgentActor[]): void {
    const present = new Set(actors.map((actor) => actor.id));
    for (const [index, holder] of this.holders) {
      if (!present.has(holder)) this.holders.delete(index);
    }
    const due: AgentActor[] = [];
    for (const actor of actors) {
      const rhythm = this.rhythmOf(actor.id);
      if (!actor.isIdle) {
        if (actor.activity !== 'wandering') this.release(rhythm);
        rhythm.dueAt = null;
        continue;
      }
      this.release(rhythm);
      if (rhythm.dueAt === null) {
        rhythm.dueAt = now + LEAST_REST + rhythm.random() * (MOST_REST - LEAST_REST);
      } else if (now >= rhythm.dueAt) {
        due.push(actor);
      }
    }
    for (let index = 0; index < due.length; index += 1) {
      const actor = due[index];
      if (actor === undefined || !actor.isIdle) continue;
      const rhythm = this.rhythmOf(actor.id);
      const partner = due
        .slice(index + 1)
        .find(
          (other) =>
            other.isIdle && distanceXz(other.home.standing, actor.home.standing) < CHAT_REACH,
        );
      if (partner !== undefined && rhythm.random() < CHAT_CHANCE) {
        this.chat(actor, partner);
        continue;
      }
      this.send(actor, rhythm);
    }
  }

  private rhythmOf(id: string): Rhythm {
    let rhythm = this.rhythms.get(id);
    if (rhythm === undefined) {
      rhythm = { random: seededRandom(id), dueAt: null, spot: null };
      this.rhythms.set(id, rhythm);
    }
    return rhythm;
  }

  private release(rhythm: Rhythm): void {
    if (rhythm.spot !== null) this.holders.delete(rhythm.spot);
    rhythm.spot = null;
  }

  /** Sends the actor to a free spot, or lets it stretch where it stands when none is free. */
  private send(actor: AgentActor, rhythm: Rhythm): void {
    const free = this.targets.map((_, index) => index).filter((index) => !this.holders.has(index));
    const choice = free[Math.floor(rhythm.random() * free.length)];
    const spot = choice === undefined ? undefined : this.spots[choice];
    const target = choice === undefined ? undefined : this.targets[choice];
    if (choice === undefined || spot === undefined || target === undefined) {
      actor.fidget(rhythm.random() < 0.5 ? 'stretch' : 'look', 3);
      return;
    }
    this.holders.set(choice, actor.id);
    rhythm.spot = choice;
    actor.wander(target, `${actor.name} ${GOING[spot.kind]}.`);
  }

  /** Walks `actor` over to `partner`'s side, and both talk for a while, facing each other. */
  private chat(actor: AgentActor, partner: AgentActor): void {
    const [dx, dz] = forwardOf(partner.home.yawDeg + 90);
    const meeting = partner.home.standing.clone().add(new Vector3(dx * 0.9, 0, dz * 0.9));
    actor.wander(
      {
        position: meeting,
        yawDeg: yawTowards(meeting, partner.home.standing),
        clip: 'talk',
        seconds: CHAT_SECONDS,
      },
      `${actor.name} chats with ${partner.name}.`,
    );
    partner.fidget('talk', CHAT_SECONDS + 5, yawTowards(partner.home.standing, meeting));
  }
}
