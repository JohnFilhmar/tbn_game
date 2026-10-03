import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Agent, Department } from '@tbn/contracts';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Vector3, type Group, type Mesh } from 'three';
import { appearanceOf, resolveAppearance, type ResolvedAppearance } from '@/game/assets/appearance';
import { CHARACTER_SET } from '@/game/assets/characters';
import { forwardOf, radiansOf, vec3, yawTowards } from '@/game/assets/geometry';
import { emitEffect } from '@/game/objects/liveEffects';
import type { ArrangedPack } from '@/game/props/arrangedPack';
import { Character } from '@/game/world/Character';
import { livePositions, OWNER_KEY } from '@/game/world/livePositions';
import { talkTo } from '@/game/world/talk';
import type { Navigation } from '@/game/world/navmesh';
import { useWorldStore } from '@/game/world/worldStore';
import { subscribeToChanges } from '@/lib/realtime/changeFeed';
import { AgentActor, type ActorHome } from './agentActor';
import { assignSeats, type Seat } from './deskAssignment';
import { WanderScheduler } from './wander';
import { worldEventsOfAll, type WorldEvent } from './worldEvents';

/** Props of `Agents`. */
export interface AgentsProps {
  /** The pack as the owner arranged it: its zones make the seats and its spots the breaks. */
  arranged: ArrangedPack;
  navigation: Navigation;
  agents: readonly Agent[];
  departments: readonly Department[];
  /** The agents with an approval waiting for the owner. */
  pendingAgentIds: ReadonlySet<string>;
}

/** How long a world event waits for the actor it names, when the roster has not caught up yet. */
const EVENT_PATIENCE_MS = 3_000;
/** How often idle agents are looked at for a wander. */
const WANDER_CHECK_SECONDS = 0.5;

function homeOf(seat: Seat, navigation: Navigation): ActorHome {
  if (seat.kind === 'waiting') {
    const standing = vec3(seat.anchor.position).setY(0);
    return { seat: standing, standing, yawDeg: seat.anchor.yaw_deg, hasDesk: false };
  }
  const chair = vec3(seat.desk.seat).setY(0);
  const [dx, dz] = forwardOf(seat.desk.yaw_deg);
  const behind = chair.clone().add(new Vector3(-dx * 0.9, 0, -dz * 0.9));
  return {
    seat: chair,
    standing: navigation.snap(behind).setY(0),
    yawDeg: seat.desk.yaw_deg,
    hasDesk: true,
  };
}

function homeKey(home: ActorHome): string {
  return `${home.seat.x},${home.seat.z};${home.standing.x},${home.standing.z};${home.yawDeg}`;
}

function titleOf(title: string): string {
  return `"${title}"`;
}

/** Plays one world event on the actors; false when an actor it names is not there yet. */
function play(event: WorldEvent, actors: Map<string, AgentActor>): boolean {
  switch (event.kind) {
    case 'task_started': {
      const actor = actors.get(event.agentId);
      if (actor === undefined) return false;
      actor.startWork(`${actor.name} starts on ${titleOf(event.title)}.`);
      return true;
    }
    case 'task_waiting': {
      const actor = actors.get(event.agentId);
      if (actor === undefined) return false;
      actor.stopWork(`${actor.name} waits on ${titleOf(event.title)}.`);
      return true;
    }
    case 'task_finished': {
      const actor = actors.get(event.agentId);
      if (actor === undefined) return false;
      const verb =
        event.status === 'done' ? 'finishes' : event.status === 'failed' ? 'gives up on' : 'drops';
      actor.stopWork(`${actor.name} ${verb} ${titleOf(event.title)}.`);
      return true;
    }
    case 'handoff': {
      const from = actors.get(event.fromAgentId);
      const to = actors.get(event.toAgentId);
      if (from === undefined || to === undefined) return false;
      from.visit(to, 'handing_off', `${from.name} hands ${titleOf(event.title)} to ${to.name}.`);
      return true;
    }
    case 'result_returned': {
      const from = actors.get(event.fromAgentId);
      const to = actors.get(event.toAgentId);
      if (from === undefined || to === undefined) return false;
      from.visit(
        to,
        'returning',
        `${from.name} brings the result of ${titleOf(event.title)} back to ${to.name}.`,
      );
      return true;
    }
    case 'agent_working': {
      actors.get(event.agentId)?.startWork();
      return true;
    }
    case 'agent_idle': {
      actors.get(event.agentId)?.stopWork();
      return true;
    }
    case 'agent_arrived':
    case 'agent_left':
      // The roster drives arrivals and departures, so an event here needs nothing more.
      return true;
  }
}

const MARKER_HEIGHT = 2.25;
/** The longest step an actor takes, and the most time one frame catches up on. */
const TICK = 0.1;
const MOST_CATCH_UP = 0.5;

/** A faceted gem that floats and turns over an agent waiting on the owner's approval. */
function ApprovalMarker({ actor }: { actor: AgentActor }) {
  const meshRef = useRef<Mesh | null>(null);
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const time = clock.elapsedTime;
    mesh.position.set(
      actor.position.x,
      MARKER_HEIGHT + Math.sin(time * 2.4) * 0.08,
      actor.position.z,
    );
    mesh.rotation.y = time * 1.6;
    mesh.visible = !actor.isGone;
  });
  return (
    <mesh ref={meshRef} position={[actor.position.x, MARKER_HEIGHT, actor.position.z]}>
      <octahedronGeometry args={[0.16, 0]} />
      <meshStandardMaterial
        color="#f59e0b"
        emissive="#b45309"
        emissiveIntensity={0.8}
        flatShading
      />
    </mesh>
  );
}

interface AgentCharacterProps {
  actor: AgentActor;
  appearance: ResolvedAppearance;
  hasApproval: boolean;
  onGone: (id: string) => void;
}

/** A pointer that moved farther than this between press and release was a drag, not a click. */
const CLICK_SLOP = 6;

/** One agent in the scene: its actor ticks here, and the group follows it every frame. */
function AgentCharacter({ actor, appearance, hasApproval, onGone }: AgentCharacterProps) {
  const groupRef = useRef<Group | null>(null);
  const clipRef = useMemo(
    () => ({
      get current() {
        return actor.clip;
      },
    }),
    [actor],
  );
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (group === null) return;
    // Steps of at most 0.1 s, so a slow frame rate never slows the agents down.
    for (let left = Math.min(delta, MOST_CATCH_UP); left > 0; left -= TICK) {
      actor.tick(Math.min(left, TICK));
    }
    group.position.copy(actor.position);
    group.rotation.y = radiansOf(actor.yawDeg);
    group.visible = !actor.isGone;
    if (actor.isGone) onGone(actor.id);
  });
  // Its own boundary: a character still loading hides nothing but itself.
  const onClick = (event: ThreeEvent<MouseEvent>): void => {
    if (event.delta > CLICK_SLOP || actor.isGone) return;
    event.stopPropagation();
    talkTo(actor.id, actor.name);
  };
  return (
    <>
      <Suspense fallback={null}>
        <group onClick={onClick}>
          <Character
            appearance={appearance}
            clipRef={clipRef}
            groupRef={groupRef}
            position={[actor.position.x, actor.position.y, actor.position.z]}
            rotationY={radiansOf(actor.yawDeg)}
          />
        </group>
      </Suspense>
      {hasApproval && <ApprovalMarker actor={actor} />}
    </>
  );
}

/**
 * Every agent in the world. The roster comes from the agents and departments the desk already
 * caches; each live agent gets an actor at its seat. An agent that joins after the first roster
 * walks in from the entry, one that leaves walks out through the exit, and the change feed's
 * world events drive everything in between.
 */
export function Agents({
  arranged,
  navigation,
  agents,
  departments,
  pendingAgentIds,
}: AgentsProps) {
  const actors = useRef(new Map<string, AgentActor>());
  const pending = useRef<{ event: WorldEvent; until: number }[]>([]);
  const hasRoster = useRef(false);
  const [roster, setRoster] = useState<AgentActor[]>([]);
  const narrate = useWorldStore((state) => state.narrate);
  const setActivity = useWorldStore((state) => state.setActivity);
  const dropActivity = useWorldStore((state) => state.dropActivity);
  const setReady = useWorldStore((state) => state.setReady);
  const { manifest, zones, spots } = arranged;
  const seats = useMemo(
    () => assignSeats({ zones, waiting: manifest.waiting }, departments, agents),
    [zones, manifest.waiting, departments, agents],
  );
  const appearances = useMemo(() => {
    const byId = new Map<string, ResolvedAppearance>();
    for (const agent of agents) {
      byId.set(
        agent.id,
        resolveAppearance(CHARACTER_SET, appearanceOf(CHARACTER_SET, agent.id, agent.appearance)),
      );
    }
    return byId;
  }, [agents]);

  useEffect(() => {
    const entry = vec3(manifest.entry.position).setY(0);
    const exit = vec3(manifest.exit.position).setY(0);
    let changed = false;
    for (const agent of agents) {
      const seat = seats.get(agent.id);
      const actor = actors.current.get(agent.id);
      if (seat === undefined) {
        actor?.leave(exit);
        continue;
      }
      const home = homeOf(seat, navigation);
      if (actor === undefined) {
        const created = new AgentActor({
          id: agent.id,
          name: agent.name,
          home,
          planner: navigation,
          listener: {
            onActivity: (activity) => setActivity(agent.id, activity),
            onNarrate: narrate,
            onEffect: (kind, at, yawDeg) => {
              const [dx, dz] = forwardOf(yawDeg);
              emitEffect(kind, at.x + dx * 0.6, at.z + dz * 0.6);
            },
          },
          from: hasRoster.current ? entry : 'home',
        });
        actors.current.set(agent.id, created);
        livePositions.set(agent.id, created.position);
        setActivity(agent.id, 'at_desk');
        changed = true;
      } else {
        actor.name = agent.name;
        actor.planner = navigation;
        if (homeKey(actor.home) !== homeKey(home)) actor.relocate(home);
      }
    }
    for (const [id, actor] of actors.current) {
      if (!agents.some((agent) => agent.id === id)) actor.leave(exit);
    }
    if (changed) setRoster([...actors.current.values()]);
    hasRoster.current = true;
    setReady(true);
  }, [agents, seats, navigation, manifest, narrate, setActivity, setReady]);

  useEffect(() => {
    const own = actors.current;
    return () => {
      setReady(false);
      for (const id of own.keys()) {
        dropActivity(id);
        livePositions.delete(id);
      }
      own.clear();
      hasRoster.current = false;
    };
  }, [setReady, dropActivity]);

  useEffect(
    () =>
      subscribeToChanges((events) => {
        const until = Date.now() + EVENT_PATIENCE_MS;
        for (const event of worldEventsOfAll(events)) pending.current.push({ event, until });
      }),
    [],
  );

  const talkingTo = useWorldStore((state) => state.talkingTo);
  useEffect(() => {
    if (talkingTo === null) return undefined;
    const actor = actors.current.get(talkingTo);
    const owner = livePositions.get(OWNER_KEY);
    if (actor === undefined) return undefined;
    actor.startTalk(owner === undefined ? actor.yawDeg : yawTowards(actor.position, owner));
    return () => actor.endTalk();
  }, [talkingTo]);

  const wander = useMemo(() => new WanderScheduler(spots, narrate), [spots, narrate]);
  const lastWanderCheck = useRef(0);

  useFrame(({ clock }) => {
    const worldTime = clock.elapsedTime;
    if (worldTime - lastWanderCheck.current >= WANDER_CHECK_SECONDS) {
      lastWanderCheck.current = worldTime;
      wander.update(worldTime, [...actors.current.values()]);
    }
    if (pending.current.length === 0) return;
    const now = Date.now();
    pending.current = pending.current.filter(
      ({ event, until }) => !play(event, actors.current) && until > now,
    );
  });

  const onGone = useCallback(
    (id: string) => {
      if (!actors.current.delete(id)) return;
      dropActivity(id);
      livePositions.delete(id);
      setRoster([...actors.current.values()]);
    },
    [dropActivity],
  );

  return (
    <>
      {roster.map((actor) => {
        const appearance = appearances.get(actor.id);
        if (appearance === undefined) return null;
        return (
          <AgentCharacter
            key={actor.id}
            actor={actor}
            appearance={appearance}
            hasApproval={pendingAgentIds.has(actor.id)}
            onGone={onGone}
          />
        );
      })}
    </>
  );
}
