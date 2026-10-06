import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { PlayerMessage } from '@tbn/contracts';
import {
  GUEST_REPOSITORY,
  type GuestRepository,
} from '@/modules/identity/repositories/interface/guest_repository.interface';
import {
  PLAYER_MESSAGE_REPOSITORY,
  type PlayerMessageRepository,
} from '@/modules/identity/repositories/interface/player_message_repository.interface';
import type { PlayerMessageRecord } from '@/modules/identity/types/player_message_record';

/** How many messages a player's list holds. */
const SHOWN_MESSAGES = 200;

/** A player as a message sees them: the owner, or a named guest. */
export interface MessagePlayer {
  owner_id: string;
  id: string;
  /** Null for a guest who has not picked a name yet. */
  name: string | null;
}

function to_view(record: PlayerMessageRecord): PlayerMessage {
  return {
    id: record.id,
    from_id: record.from_id,
    from_name: record.from_name,
    to_id: record.to_id,
    text: record.text,
    read_at: record.read_at?.toISOString() ?? null,
    created_at: record.created_at.toISOString(),
  };
}

/** Messages between the players of one owner's world: the owner and the guests. */
@Injectable()
export class PlayerMessageService {
  constructor(
    @Inject(PLAYER_MESSAGE_REPOSITORY) private readonly messages: PlayerMessageRepository,
    @Inject(GUEST_REPOSITORY) private readonly guests: GuestRepository,
  ) {}

  /**
   * Sends a message to the owner or one of the owner's guests.
   *
   * @throws ConflictException when the sender has no name yet.
   * @throws BadRequestException for a message to oneself or to someone not in this world.
   */
  async send(from: MessagePlayer, to_id: string, text: string): Promise<PlayerMessage> {
    if (from.name === null) throw new ConflictException('Pick a guest name first');
    if (to_id === from.id) throw new BadRequestException('You cannot message yourself');
    if (to_id !== from.owner_id) {
      const guest = await this.guests.find_guest(from.owner_id, to_id);
      if (guest === null || guest.revoked_at !== null || guest.name === null) {
        throw new BadRequestException('No such player');
      }
    }
    const record = await this.messages.create(from.owner_id, {
      from_id: from.id,
      from_name: from.name,
      to_id,
      text,
    });
    return to_view(record);
  }

  /** The messages a player sent or received, oldest first. */
  async list(player: MessagePlayer): Promise<PlayerMessage[]> {
    return (await this.messages.involving(player.owner_id, player.id, SHOWN_MESSAGES)).map(to_view);
  }

  /** Marks every message `from_id` sent the player as read. */
  async mark_read(player: MessagePlayer, from_id: string): Promise<void> {
    await this.messages.mark_read(player.owner_id, from_id, player.id, new Date());
  }

  /** The views of some messages, for the event log. */
  async views_by_ids(owner_id: string, ids: string[]): Promise<PlayerMessage[]> {
    return (await this.messages.by_ids(owner_id, ids)).map(to_view);
  }
}
