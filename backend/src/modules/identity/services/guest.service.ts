import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateGuestInvite, CreatedGuestInvite, Guest, GuestInvite } from '@tbn/contracts';
import type { AuthenticatedGuest } from '@/lib/auth/authenticated_owner';
import { is_unique_violation } from '@/lib/database/prisma_errors';
import {
  GUEST_REPOSITORY,
  type GuestRepository,
} from '@/modules/identity/repositories/interface/guest_repository.interface';
import type { GuestInviteRecord, GuestRecord } from '@/modules/identity/types/guest_record';
import {
  GuestSessionService,
  INVITE_TOKEN_PREFIX,
  hash_token,
  new_token,
} from './guest_session.service';

/** How long an unused invite link works. */
const INVITE_MS = 24 * 60 * 60_000;

/** Maps a guest row to the API shape. */
export function to_guest_view(record: GuestRecord): Guest {
  return {
    id: record.id,
    name: record.name,
    last_seen_at: record.last_seen_at?.toISOString() ?? null,
    revoked_at: record.revoked_at?.toISOString() ?? null,
    created_at: record.created_at.toISOString(),
  };
}

function to_invite_view(record: GuestInviteRecord): GuestInvite {
  return {
    id: record.id,
    label: record.label,
    guest_id: record.guest_id,
    expires_at: record.expires_at.toISOString(),
    redeemed_at: record.redeemed_at?.toISOString() ?? null,
    created_at: record.created_at.toISOString(),
  };
}

/** The owner's invites and guests, and a guest's own name. */
@Injectable()
export class GuestService {
  constructor(
    @Inject(GUEST_REPOSITORY) private readonly guests: GuestRepository,
    private readonly sessions: GuestSessionService,
  ) {}

  /**
   * Creates an invite and returns its link path, the only time the token is shown.
   *
   * @throws NotFoundException when `guest_id` names no guest of the owner.
   * @throws ConflictException when that guest was revoked.
   */
  async create_invite(owner_id: string, input: CreateGuestInvite): Promise<CreatedGuestInvite> {
    const guest_id = input.guest_id ?? null;
    if (guest_id !== null) {
      const guest = await this.require(owner_id, guest_id);
      if (guest.revoked_at !== null) throw new ConflictException('Guest was revoked');
    }
    const token = new_token(INVITE_TOKEN_PREFIX);
    const record = await this.guests.create_invite(owner_id, {
      label: input.label,
      guest_id,
      token_hash: hash_token(token),
      expires_at: new Date(Date.now() + INVITE_MS),
    });
    return { invite: to_invite_view(record), path: `/invite/${token}` };
  }

  /** Invites that still work, newest first. */
  async list_invites(owner_id: string): Promise<GuestInvite[]> {
    return (await this.guests.list_open_invites(owner_id, new Date())).map(to_invite_view);
  }

  /** @throws NotFoundException when no open invite has the id. */
  async revoke_invite(owner_id: string, id: string): Promise<void> {
    if (!(await this.guests.revoke_invite(owner_id, id, new Date()))) {
      throw new NotFoundException('Invite not found');
    }
  }

  /** The owner's guests, newest first. */
  async list(owner_id: string): Promise<Guest[]> {
    return (await this.guests.list_guests(owner_id)).map(to_guest_view);
  }

  /** @throws NotFoundException when the guest is unknown. */
  async revoke(owner_id: string, id: string): Promise<Guest> {
    const record = await this.guests.revoke_guest(owner_id, id, new Date());
    if (record === null) throw new NotFoundException('Guest not found');
    this.sessions.forget(id);
    return to_guest_view(record);
  }

  /**
   * Sets a guest's own name, unique among the owner's guests and different from the owner's
   * username, ignoring case.
   *
   * @throws ConflictException when the name is taken.
   */
  async set_name(guest: AuthenticatedGuest, name: string): Promise<Guest> {
    const taken =
      name.toLowerCase() === guest.owner_username.toLowerCase() ||
      (await this.guests.is_name_taken(guest.owner_id, name, guest.id));
    if (taken) throw new ConflictException('That name is taken');
    try {
      const record = await this.guests.set_name(guest.owner_id, guest.id, name);
      this.sessions.forget(guest.id);
      return to_guest_view(record);
    } catch (error: unknown) {
      if (is_unique_violation(error)) throw new ConflictException('That name is taken');
      throw error;
    }
  }

  private async require(owner_id: string, id: string): Promise<GuestRecord> {
    const record = await this.guests.find_guest(owner_id, id);
    if (record === null) throw new NotFoundException('Guest not found');
    return record;
  }
}
