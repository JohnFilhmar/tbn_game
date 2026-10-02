import { GoneException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ChangeEventSchema,
  EventEntitySchema,
  type ChangeEvent,
  type EventEntity,
  type EventsPage,
} from '@tbn/contracts';
import {
  EVENT_REPOSITORY,
  type EventRepository,
} from '@/modules/events/repositories/interface/event_repository.interface';
import type { EventBounds, EventRecord } from '@/modules/events/types/event_record';
import { EventHydratorService } from './event_hydrator.service';

/**
 * True when the log still holds every event after `cursor`: the cursor is not ahead of the head,
 * and nothing between it and the oldest event kept was pruned.
 */
export function cursor_kept(bounds: EventBounds, cursor: number): boolean {
  if (cursor > bounds.head_seq) return false;
  const oldest = bounds.oldest_seq ?? bounds.head_seq + 1;
  return cursor + 1 >= oldest;
}

/** Events read from the log, and the last sequence read, which a skipped row may follow. */
export interface EventBatch {
  events: ChangeEvent[];
  /** The last sequence read, or the cursor when nothing was read. */
  last_seq: number;
}

/** The fields of a view, to keep `changed` to what the client can see. */
function visible_fields(data: unknown): Set<string> | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  return new Set(Object.keys(data));
}

/**
 * Turns rows of the event log into the events clients receive: each carries the entity's current
 * view, read once per entity per batch, or null when the entity is gone.
 */
@Injectable()
export class EventFeedService {
  private readonly logger = new Logger(EventFeedService.name);

  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    private readonly hydrator: EventHydratorService,
  ) {}

  /** Where the owner's log stands. */
  bounds(owner_id: string): Promise<EventBounds> {
    return this.events.bounds(owner_id);
  }

  /** Up to `limit` events after `after`, oldest first, with their views. */
  async read(owner_id: string, after: number, limit: number): Promise<EventBatch> {
    const records = await this.events.list_after(owner_id, after, limit);
    return {
      events: await this.hydrate(owner_id, records),
      last_seq: records[records.length - 1]?.seq ?? after,
    };
  }

  /**
   * A page of `GET /events`.
   *
   * @throws GoneException when the events after `after` are no longer all kept.
   */
  async page(owner_id: string, after: number, limit: number): Promise<EventsPage> {
    const bounds = await this.events.bounds(owner_id);
    if (!cursor_kept(bounds, after)) {
      throw new GoneException({
        statusCode: 410,
        message: 'Events after this cursor are no longer kept: reload and continue from the head',
        head_seq: bounds.head_seq,
        oldest_seq: bounds.oldest_seq ?? bounds.head_seq + 1,
      });
    }
    const batch = await this.read(owner_id, after, limit);
    return { head_seq: Math.max(bounds.head_seq, batch.last_seq), events: batch.events };
  }

  private async hydrate(owner_id: string, records: EventRecord[]): Promise<ChangeEvent[]> {
    const wanted = new Map<EventEntity, Set<string>>();
    for (const record of records) {
      const entity = EventEntitySchema.safeParse(record.entity);
      if (!entity.success || record.op === 'delete') continue;
      const ids = wanted.get(entity.data) ?? new Set<string>();
      ids.add(record.entity_id);
      wanted.set(entity.data, ids);
    }
    const views = new Map<string, Map<string, unknown>>();
    for (const [entity, ids] of wanted) {
      views.set(entity, await this.hydrator.load(owner_id, entity, [...ids]));
    }
    const events: ChangeEvent[] = [];
    for (const record of records) {
      const data = views.get(record.entity)?.get(record.entity_id) ?? null;
      const fields = visible_fields(data);
      const event = {
        seq: record.seq,
        entity: record.entity,
        id: record.entity_id,
        op: record.op,
        changed:
          record.changed === null || fields === null
            ? record.changed
            : record.changed.filter((field) => fields.has(field)),
        data,
        at: record.created_at.toISOString(),
      };
      const parsed = ChangeEventSchema.safeParse(event);
      if (parsed.success) {
        events.push(parsed.data);
        continue;
      }
      const bare = ChangeEventSchema.safeParse({ ...event, data: null });
      if (!bare.success) {
        this.logger.error(`Event ${record.seq} of ${record.entity} has no contract; skipped`);
        continue;
      }
      this.logger.warn(`Event ${record.seq}: the ${record.entity} view did not fit its contract`);
      events.push(bare.data);
    }
    return events;
  }
}
