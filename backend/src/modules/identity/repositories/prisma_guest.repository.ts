import { Injectable } from '@nestjs/common';
import type { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/lib/database/prisma.service';
import type {
  GuestInviteRecord,
  GuestInviteWrite,
  GuestRecord,
  GuestSessionRecord,
  GuestSessionWrite,
} from '@/modules/identity/types/guest_record';
import type { GuestRepository } from './interface/guest_repository.interface';

const guest_columns = {
  id: true,
  owner_id: true,
  name: true,
  last_seen_at: true,
  revoked_at: true,
  created_at: true,
} satisfies Prisma.GuestSelect;

const invite_columns = {
  id: true,
  owner_id: true,
  guest_id: true,
  label: true,
  expires_at: true,
  redeemed_at: true,
  revoked_at: true,
  created_at: true,
} satisfies Prisma.GuestInviteSelect;

/** `GuestRepository` on Prisma. */
@Injectable()
export class PrismaGuestRepository implements GuestRepository {
  constructor(private readonly prisma: PrismaService) {}

  create_invite(owner_id: string, write: GuestInviteWrite): Promise<GuestInviteRecord> {
    return this.prisma.guestInvite.create({
      data: { owner_id, ...write },
      select: invite_columns,
    });
  }

  list_open_invites(owner_id: string, now: Date): Promise<GuestInviteRecord[]> {
    return this.prisma.guestInvite.findMany({
      where: { owner_id, redeemed_at: null, revoked_at: null, expires_at: { gt: now } },
      orderBy: { created_at: 'desc' },
      select: invite_columns,
    });
  }

  async revoke_invite(owner_id: string, id: string, now: Date): Promise<boolean> {
    const result = await this.prisma.guestInvite.updateMany({
      where: { id, owner_id, redeemed_at: null, revoked_at: null },
      data: { revoked_at: now },
    });
    return result.count > 0;
  }

  redeem_invite(
    token_hash: string,
    now: Date,
    session: GuestSessionWrite,
  ): Promise<GuestRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      // The conditional update claims the invite, so two tabs racing on one link open one session.
      const claimed = await tx.guestInvite.updateMany({
        where: { token_hash, redeemed_at: null, revoked_at: null, expires_at: { gt: now } },
        data: { redeemed_at: now },
      });
      if (claimed.count === 0) return null;
      const invite = await tx.guestInvite.findUniqueOrThrow({ where: { token_hash } });
      let guest =
        invite.guest_id === null
          ? await tx.guest.create({ data: { owner_id: invite.owner_id }, select: guest_columns })
          : await tx.guest.findUnique({ where: { id: invite.guest_id }, select: guest_columns });
      if (guest === null || guest.revoked_at !== null) return null;
      if (invite.guest_id === null) {
        await tx.guestInvite.update({ where: { id: invite.id }, data: { guest_id: guest.id } });
      }
      guest = await tx.guest.update({
        where: { id: guest.id },
        data: { last_seen_at: now },
        select: guest_columns,
      });
      await tx.guestSession.create({
        data: { owner_id: invite.owner_id, guest_id: guest.id, ...session },
      });
      return guest;
    });
  }

  async find_session(token_hash: string, now: Date): Promise<GuestSessionRecord | null> {
    const session = await this.prisma.guestSession.findFirst({
      where: { token_hash, expires_at: { gt: now }, guest: { revoked_at: null } },
      select: {
        id: true,
        expires_at: true,
        guest: { select: guest_columns },
        owner: { select: { username: true } },
      },
    });
    if (session === null) return null;
    return {
      id: session.id,
      expires_at: session.expires_at,
      guest: session.guest,
      owner_username: session.owner.username,
    };
  }

  async touch_guest(id: string, now: Date): Promise<void> {
    await this.prisma.guest.update({ where: { id }, data: { last_seen_at: now } });
  }

  list_guests(owner_id: string): Promise<GuestRecord[]> {
    return this.prisma.guest.findMany({
      where: { owner_id },
      orderBy: { created_at: 'desc' },
      select: guest_columns,
    });
  }

  find_guest(owner_id: string, id: string): Promise<GuestRecord | null> {
    return this.prisma.guest.findFirst({ where: { id, owner_id }, select: guest_columns });
  }

  async is_name_taken(owner_id: string, name: string, except_id: string): Promise<boolean> {
    const other = await this.prisma.guest.findFirst({
      where: { owner_id, name: { equals: name, mode: 'insensitive' }, id: { not: except_id } },
      select: { id: true },
    });
    return other !== null;
  }

  set_name(owner_id: string, id: string, name: string): Promise<GuestRecord> {
    return this.prisma.guest.update({
      where: { id, owner_id },
      data: { name },
      select: guest_columns,
    });
  }

  revoke_guest(owner_id: string, id: string, now: Date): Promise<GuestRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const guest = await tx.guest.findFirst({ where: { id, owner_id }, select: { id: true } });
      if (guest === null) return null;
      await tx.guestSession.deleteMany({ where: { guest_id: id } });
      return tx.guest.update({
        where: { id },
        data: { revoked_at: now },
        select: guest_columns,
      });
    });
  }
}
