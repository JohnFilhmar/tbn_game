import { Controller, Get, Post } from '@nestjs/common';
import {
  IdSchema,
  OwnerMessageSchema,
  TranscriptQuerySchema,
  type OwnerMessage,
  type TranscriptEntry,
  type TranscriptQuery,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam, ZodQuery } from '@/lib/validation/zod.decorator';
import { TranscriptService } from '@/modules/runtime/services/transcript.service';

/** An agent's transcript and the owner's messages into it. */
@Controller('agents/:id')
export class TranscriptController {
  constructor(private readonly transcript_service: TranscriptService) {}

  @Get('transcript')
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodQuery(TranscriptQuerySchema) query: TranscriptQuery,
  ): Promise<TranscriptEntry[]> {
    return this.transcript_service.list(owner.id, id, query);
  }

  @Post('messages')
  send(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(OwnerMessageSchema) body: OwnerMessage,
  ): Promise<TranscriptEntry> {
    return this.transcript_service.send_owner_message(owner.id, id, body.text);
  }
}
