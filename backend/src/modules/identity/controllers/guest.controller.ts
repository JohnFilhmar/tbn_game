import { Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  CreateGuestInviteSchema,
  IdSchema,
  UpdateGuestNameSchema,
  type CreateGuestInvite,
  type CreatedGuestInvite,
  type Guest,
  type GuestInvite,
  type UpdateGuestName,
} from '@tbn/contracts';
import type { AuthenticatedGuest, AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentGuest } from '@/lib/auth/current_guest.decorator';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { GuestAllowed, OwnerOnly } from '@/lib/auth/guest_policy.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { GuestService } from '@/modules/identity/services/guest.service';

/** The owner's guests and invite links, and a guest's own name. */
@OwnerOnly()
@Controller('guests')
export class GuestController {
  constructor(private readonly guests: GuestService) {}

  /** The owner's guests. */
  @Get()
  list(@CurrentOwner() owner: AuthenticatedOwner): Promise<Guest[]> {
    return this.guests.list(owner.id);
  }

  /** Invites that still work. */
  @Get('invites')
  list_invites(@CurrentOwner() owner: AuthenticatedOwner): Promise<GuestInvite[]> {
    return this.guests.list_invites(owner.id);
  }

  /** Creates an invite; the response holds its link path, shown this once. */
  @Post('invites')
  create_invite(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(CreateGuestInviteSchema) body: CreateGuestInvite,
  ): Promise<CreatedGuestInvite> {
    return this.guests.create_invite(owner.id, body);
  }

  /** Stops an unused invite from working. */
  @Post('invites/:id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke_invite(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<void> {
    return this.guests.revoke_invite(owner.id, id);
  }

  /** Shuts a guest out and ends their sessions. */
  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Guest> {
    return this.guests.revoke(owner.id, id);
  }

  /** The signed-in guest picks their name. */
  @GuestAllowed()
  @Patch('me')
  rename(
    @CurrentGuest() guest: AuthenticatedGuest,
    @ZodBody(UpdateGuestNameSchema) body: UpdateGuestName,
  ): Promise<Guest> {
    return this.guests.set_name(guest, body.name);
  }
}
