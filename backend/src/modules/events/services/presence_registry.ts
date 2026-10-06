import { PLAYER_LINGER_MS, type Player, type PlayerPose } from '@tbn/contracts';

/** A player joining from one socket. */
export interface Joining {
  id: string;
  kind: Player['kind'];
  name: string;
}

/** Where the registry reports what changed. */
export interface PresenceListener {
  /** `player` changed; everyone but `player` itself should hear it. */
  changed(owner_id: string, player: Player): void;
  /** A player who left `PLAYER_LINGER_MS` ago is gone. */
  gone(owner_id: string, player_id: string): void;
}

interface Entry {
  player: Player;
  sockets: Set<string>;
  timer: NodeJS.Timeout | null;
}

/**
 * The players in each owner's world and where they stand, in memory. A player may have several
 * sockets; they go offline when the last one closes, and are gone `linger_ms` later unless they
 * come back first.
 *
 * Ceiling: the players live in this web process's memory, so a second web process would split
 * them in two; a shared store such as a PostgreSQL table with NOTIFY would be the upgrade.
 */
export class PresenceRegistry {
  private readonly owners = new Map<string, Map<string, Entry>>();

  constructor(
    private readonly listener: PresenceListener,
    private readonly linger_ms = PLAYER_LINGER_MS,
  ) {}

  /** Adds a socket of a player, and returns the other players already in the world. */
  join(owner_id: string, joining: Joining, socket_id: string): Player[] {
    const players = this.owners.get(owner_id) ?? new Map<string, Entry>();
    this.owners.set(owner_id, players);
    const entry = players.get(joining.id);
    if (entry === undefined) {
      const player: Player = { ...joining, pose: null, online: true, offline_at: null };
      players.set(joining.id, { player, sockets: new Set([socket_id]), timer: null });
      this.listener.changed(owner_id, player);
    } else {
      entry.sockets.add(socket_id);
      if (entry.timer !== null) clearTimeout(entry.timer);
      entry.timer = null;
      if (!entry.player.online || entry.player.name !== joining.name) {
        entry.player = { ...entry.player, name: joining.name, online: true, offline_at: null };
        this.listener.changed(owner_id, entry.player);
      }
    }
    return [...players.values()]
      .map((other) => other.player)
      .filter((player) => player.id !== joining.id);
  }

  /** Records where a player stands now. */
  move(owner_id: string, player_id: string, pose: PlayerPose): void {
    const entry = this.owners.get(owner_id)?.get(player_id);
    if (entry === undefined) return;
    entry.player = { ...entry.player, pose };
    this.listener.changed(owner_id, entry.player);
  }

  /** Renames a player, such as a guest who just picked a name. */
  rename(owner_id: string, player_id: string, name: string): void {
    const entry = this.owners.get(owner_id)?.get(player_id);
    if (entry === undefined || entry.player.name === name) return;
    entry.player = { ...entry.player, name };
    this.listener.changed(owner_id, entry.player);
  }

  /** Removes a socket; the player goes offline when it was their last. */
  leave(owner_id: string, player_id: string, socket_id: string): void {
    const players = this.owners.get(owner_id);
    const entry = players?.get(player_id);
    if (players === undefined || entry === undefined) return;
    entry.sockets.delete(socket_id);
    if (entry.sockets.size > 0) return;
    entry.player = { ...entry.player, online: false, offline_at: new Date().toISOString() };
    this.listener.changed(owner_id, entry.player);
    entry.timer = setTimeout(() => {
      players.delete(player_id);
      if (players.size === 0) this.owners.delete(owner_id);
      this.listener.gone(owner_id, player_id);
    }, this.linger_ms);
    entry.timer.unref();
  }

  /** Forgets every timer, at shutdown. */
  clear(): void {
    for (const players of this.owners.values()) {
      for (const entry of players.values()) {
        if (entry.timer !== null) clearTimeout(entry.timer);
      }
    }
    this.owners.clear();
  }
}
