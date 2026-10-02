import { Controller, Get } from '@nestjs/common';
import { EventsQuerySchema, type EventsPage, type EventsQuery } from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodQuery } from '@/lib/validation/zod.decorator';
import { EventFeedService } from '@/modules/events/services/event_feed.service';

/** The event log over HTTP: what a client missed, without a socket. */
@Controller('events')
export class EventController {
  constructor(private readonly feed: EventFeedService) {}

  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodQuery(EventsQuerySchema) query: EventsQuery,
  ): Promise<EventsPage> {
    return this.feed.page(owner.id, query.after, query.limit);
  }
}
