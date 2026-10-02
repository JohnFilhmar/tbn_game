import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';
import type { EventBounds, EventRecord } from '@/modules/events/types/event_record';
import type { EventRepository } from './interface/event_repository.interface';

const ChangedSchema = z.array(z.string()).nullable();

/** `EventRepository` on Prisma. Sequences are `bigint` in the table and numbers in the app. */
@Injectable()
export class PrismaEventRepository implements EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list_after(owner_id: string, after_seq: number, limit: number): Promise<EventRecord[]> {
    const rows = await this.prisma.event.findMany({
      where: { owner_id, seq: { gt: BigInt(after_seq) } },
      orderBy: { seq: 'asc' },
      take: limit,
    });
    return rows.map((row) => {
      const changed = ChangedSchema.safeParse(row.changed);
      return {
        owner_id: row.owner_id,
        seq: Number(row.seq),
        entity: row.entity,
        entity_id: row.entity_id,
        op: row.op,
        changed: changed.success ? changed.data : null,
        created_at: row.created_at,
      };
    });
  }

  async bounds(owner_id: string): Promise<EventBounds> {
    const [head, oldest] = await Promise.all([
      this.prisma.eventHead.findUnique({ where: { owner_id } }),
      this.prisma.event.findFirst({
        where: { owner_id },
        orderBy: { seq: 'asc' },
        select: { seq: true },
      }),
    ]);
    return {
      head_seq: head === null ? 0 : Number(head.last_seq),
      oldest_seq: oldest === null ? null : Number(oldest.seq),
    };
  }

  async prune(before: Date): Promise<number> {
    const { count } = await this.prisma.event.deleteMany({ where: { created_at: { lt: before } } });
    return count;
  }
}
