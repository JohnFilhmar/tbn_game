import { Controller, Get, Post, Req } from '@nestjs/common';
import {
  IdSchema,
  SendGuestChatMessageSchema,
  type GuestChatMessage,
  type SendGuestChatMessage,
} from '@tbn/contracts';
import type { AuthenticatedGuest, AuthenticatedRequest } from '@/lib/auth/authenticated_owner';
import { CurrentGuest } from '@/lib/auth/current_guest.decorator';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { GuestAllowed } from '@/lib/auth/guest_policy.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { GuestChatService } from '@/modules/runtime/services/guest_chat/guest_chat.service';

/** A guest's conversation with an idle agent, answered on the guest model. */
@Controller('agents/:id/guest_chat')
export class GuestChatController {
  constructor(private readonly chats: GuestChatService) {}

  /** A guest sees their own conversation with the agent; the owner sees every guest's. */
  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Req() request: AuthenticatedRequest,
    @ZodParam('id', IdSchema) agent_id: string,
  ): Promise<GuestChatMessage[]> {
    return this.chats.list(owner.id, agent_id, request.guest?.id ?? null);
  }

  /** A guest says something to an idle agent; the reply arrives as a change event. */
  @GuestAllowed()
  @Post()
  send(
    @CurrentGuest() guest: AuthenticatedGuest,
    @ZodParam('id', IdSchema) agent_id: string,
    @ZodBody(SendGuestChatMessageSchema) body: SendGuestChatMessage,
  ): Promise<GuestChatMessage> {
    return this.chats.send(guest, agent_id, body.text);
  }
}
