import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ReadPlayerMessagesSchema,
  SendPlayerMessageSchema,
  type PlayerMessage,
  type ReadPlayerMessages,
  type SendPlayerMessage,
} from '@tbn/contracts';
import type { AuthenticatedRequest } from '@/lib/auth/authenticated_owner';
import { GuestAllowed } from '@/lib/auth/guest_policy.decorator';
import { ZodBody } from '@/lib/validation/zod.decorator';
import {
  PlayerMessageService,
  type MessagePlayer,
} from '@/modules/identity/services/player_message.service';

/** The player behind a request: a guest, or the owner. */
function player_of(request: AuthenticatedRequest): MessagePlayer {
  if (request.guest !== undefined) {
    return { owner_id: request.guest.owner_id, id: request.guest.id, name: request.guest.name };
  }
  if (request.owner === undefined) throw new UnauthorizedException();
  return { owner_id: request.owner.id, id: request.owner.id, name: request.owner.username };
}

/** Messages between players: the owner and the guests. */
@Controller('player_messages')
export class PlayerMessageController {
  constructor(private readonly messages: PlayerMessageService) {}

  /** The messages the signed-in player sent or received. */
  @Get()
  list(@Req() request: AuthenticatedRequest): Promise<PlayerMessage[]> {
    return this.messages.list(player_of(request));
  }

  /** Sends a message to another player. */
  @GuestAllowed()
  @Post()
  send(
    @Req() request: AuthenticatedRequest,
    @ZodBody(SendPlayerMessageSchema) body: SendPlayerMessage,
  ): Promise<PlayerMessage> {
    return this.messages.send(player_of(request), body.to_id, body.text);
  }

  /** Marks the messages from one player as read. */
  @GuestAllowed()
  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  read(
    @Req() request: AuthenticatedRequest,
    @ZodBody(ReadPlayerMessagesSchema) body: ReadPlayerMessages,
  ): Promise<void> {
    return this.messages.mark_read(player_of(request), body.from_id);
  }
}
