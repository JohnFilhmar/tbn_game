import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { EnvironmentName } from '@tbn/contracts';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import type { Group, Vector3 } from 'three';
import { appearanceOf, resolveAppearance, type ResolvedAppearance } from '@/game/assets/appearance';
import { CHARACTER_SET } from '@/game/assets/characters';
import { radiansOf, vec3 } from '@/game/assets/geometry';
import { WanderScheduler } from '@/game/npcs/wander';
import type { ArrangedPack } from '@/game/props/arrangedPack';
import { Character } from '@/game/world/Character';
import { playerPositions } from '@/game/world/livePositions';
import type { Navigation } from '@/game/world/navmesh';
import { usePlayersStore, type WorldPlayer } from '@/lib/stores/playersStore';
import { chatWith } from './chatWith';
import { RemoteBody } from './remoteBody';

/** The longest step a body takes, and the most time one frame catches up on. */
const TICK = 0.1;
const MOST_CATCH_UP = 0.5;
/** How often an offline player may set off on a wander. */
const WANDER_CHECK_SECONDS = 0.5;
/** A drag longer than this is the camera turning, not a click. */
const CLICK_SLOP = 4;

/**
 * A body per player, made the first time they are drawn, so a re-render finds the same one.
 */
// ponytail: one module-level map, like the live positions, fine for one world per page.
const bodies = new Map<string, RemoteBody>();

/** Props of `RemotePlayers`. */
export interface RemotePlayersProps {
  navigation: Navigation;
  arranged: ArrangedPack;
  environment: EnvironmentName;
  /** How the owner looks, for the owner's body in a guest's world. */
  hostAppearance: ResolvedAppearance;
  /** This client's own player id, left out. */
  myId: string | null;
}

/**
 * The other people in the world: the owner and the guests, each a body walking to the pose they
 * last sent. A player who left keeps wandering like an idle agent, shown offline, until the server
 * says they are gone; then they walk out through the exit and disappear.
 */
export function RemotePlayers({
  navigation,
  arranged,
  environment,
  hostAppearance,
  myId,
}: RemotePlayersProps) {
  const players = usePlayersStore((state) => state.players);
  const remove = usePlayersStore((state) => state.remove);

  const exit = useMemo(() => vec3(arranged.manifest.exit.position).setY(0), [arranged]);
  const wander = useMemo(() => new WanderScheduler(arranged.spots, () => undefined), [arranged]);
  const lastWanderCheck = useRef(0);
  const shown = Object.values(players).filter(
    (player) => player.id !== myId && player.pose?.environment === environment,
  );

  const drawn = shown.flatMap((player) => {
    if (player.pose === null) return [];
    let body = bodies.get(player.id);
    if (body === undefined) {
      body = new RemoteBody(player.id, player.pose);
      bodies.set(player.id, body);
    } else if (player.online) {
      body.follow(player.pose);
    }
    return [{ player, body }];
  });
  for (const id of bodies.keys()) {
    if (!drawn.some((entry) => entry.player.id === id)) bodies.delete(id);
  }

  // A pack switch remounts the world; the bodies start again where the players stand.
  useEffect(() => () => bodies.clear(), []);

  useFrame(({ clock }) => {
    if (clock.elapsedTime - lastWanderCheck.current < WANDER_CHECK_SECONDS) return;
    lastWanderCheck.current = clock.elapsedTime;
    const wanderers = drawn
      .filter(({ player }) => !player.online && !player.isLeaving)
      .map(({ player, body }) => body.wanderer(player.name, navigation));
    wander.update(clock.elapsedTime, wanderers);
  });

  return (
    <>
      {drawn.map(({ player, body }) => {
        return (
          <RemotePlayer
            key={player.id}
            player={player}
            body={body}
            appearance={
              player.kind === 'owner'
                ? hostAppearance
                : resolveAppearance(CHARACTER_SET, appearanceOf(CHARACTER_SET, player.id, {}))
            }
            navigation={navigation}
            exit={exit}
            onGone={remove}
          />
        );
      })}
    </>
  );
}

interface RemotePlayerProps {
  player: WorldPlayer;
  body: RemoteBody;
  appearance: ResolvedAppearance;
  navigation: Navigation;
  exit: Vector3;
  onGone: (id: string) => void;
}

function RemotePlayer({ player, body, appearance, navigation, exit, onGone }: RemotePlayerProps) {
  const groupRef = useRef<Group | null>(null);
  const clipRef = useMemo(
    () => ({
      get current() {
        return body.clip;
      },
    }),
    [body],
  );
  const timeScaleRef = useMemo(
    () => ({
      get current() {
        return body.timeScale;
      },
    }),
    [body],
  );
  useEffect(() => {
    playerPositions.set(player.id, body.position);
    return () => {
      playerPositions.delete(player.id);
    };
  }, [player.id, body]);
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (group === null) return;
    const mode = player.isLeaving ? 'leaving' : player.online ? 'online' : 'offline';
    for (let left = Math.min(delta, MOST_CATCH_UP); left > 0; left -= TICK) {
      body.tick(Math.min(left, TICK), mode, player.name, navigation, exit);
    }
    group.position.copy(body.position);
    group.rotation.y = radiansOf(body.yawDeg);
    group.visible = !body.isGone;
    if (body.isGone) onGone(player.id);
  });
  const onClick = (event: ThreeEvent<MouseEvent>): void => {
    if (event.delta > CLICK_SLOP) return;
    event.stopPropagation();
    chatWith(player.id, player.name);
  };
  return (
    <Suspense fallback={null}>
      <group onClick={onClick}>
        <Character
          appearance={appearance}
          clipRef={clipRef}
          timeScaleRef={timeScaleRef}
          groupRef={groupRef}
          position={[body.position.x, 0, body.position.z]}
          rotationY={radiansOf(body.yawDeg)}
        />
      </group>
    </Suspense>
  );
}
