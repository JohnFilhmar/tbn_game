import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import type {
  PlayerMessageRecord,
  PlayerMessageWrite,
} from '@/modules/identity/types/player_message_record';
import type { PlayerMessageRepository } from './interface/player_message_repository.interface';

/** `PlayerMessageRepository` on Prisma. */
@Injectable()
export class PrismaPlayerMessageRepository implements PlayerMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(owner_id: string, write: PlayerMessageWrite): Promise<PlayerMessageRecord> {
    return this.prisma.playerMessage.create({ data: { owner_id, ...write } });
  }

  async involving(
    owner_id: string,
    player_id: string,
    limit: number,
  ): Promise<PlayerMessageRecord[]> {
    const rows = await this.prisma.playerMessage.findMany({
      where: { owner_id, OR: [{ from_id: player_id }, { to_id: player_id }] },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return rows.reverse();
  }

  async mark_read(owner_id: string, from_id: string, to_id: string, now: Date): Promise<number> {
    const result = await this.prisma.playerMessage.updateMany({
      where: { owner_id, from_id, to_id, read_at: null },
      data: { read_at: now },
    });
    return result.count;
  }

  by_ids(owner_id: string, ids: string[]): Promise<PlayerMessageRecord[]> {
    return this.prisma.playerMessage.findMany({ where: { owner_id, id: { in: ids } } });
  }
}
