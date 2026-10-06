import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import type { GuestChatRecord, GuestChatWrite } from '@/modules/runtime/types/guest_chat_record';
import type { GuestChatRepository } from './interface/guest_chat_repository.interface';

interface GuestChatRow extends Omit<GuestChatRecord, 'role'> {
  role: string;
}

function to_record(row: GuestChatRow): GuestChatRecord {
  return { ...row, role: row.role === 'agent' ? 'agent' : 'guest' };
}

/** `GuestChatRepository` on Prisma. */
@Injectable()
export class PrismaGuestChatRepository implements GuestChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(owner_id: string, write: GuestChatWrite): Promise<GuestChatRecord> {
    return to_record(await this.prisma.guestChatMessage.create({ data: { owner_id, ...write } }));
  }

  async recent(
    owner_id: string,
    agent_id: string,
    guest_id: string | null,
    limit: number,
  ): Promise<GuestChatRecord[]> {
    const rows = await this.prisma.guestChatMessage.findMany({
      where: { owner_id, agent_id, ...(guest_id !== null && { guest_id }) },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return rows.reverse().map(to_record);
  }

  async by_ids(owner_id: string, ids: string[]): Promise<GuestChatRecord[]> {
    const rows = await this.prisma.guestChatMessage.findMany({
      where: { owner_id, id: { in: ids } },
    });
    return rows.map(to_record);
  }
}
