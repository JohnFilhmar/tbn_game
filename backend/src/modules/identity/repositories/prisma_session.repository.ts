import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import type { SessionRecord } from '@/modules/identity/types/owner_record';
import type { SessionRepository } from './interface/session_repository.interface';

const with_owner = { owner: { select: { id: true, username: true } } };

/** `SessionRepository` on Prisma. */
@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(owner_id: string, token_hash: string, expires_at: Date): Promise<SessionRecord> {
    return this.prisma.session.create({
      data: { owner_id, token_hash, expires_at },
      include: with_owner,
    });
  }

  find_active_by_token_hash(token_hash: string, now: Date): Promise<SessionRecord | null> {
    return this.prisma.session.findFirst({
      where: { token_hash, expires_at: { gt: now } },
      include: with_owner,
    });
  }

  async touch(id: string, now: Date): Promise<void> {
    await this.prisma.session.update({ where: { id }, data: { last_seen_at: now } });
  }

  async delete_by_token_hash(token_hash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { token_hash } });
  }

  async delete_expired(now: Date): Promise<number> {
    const result = await this.prisma.session.deleteMany({ where: { expires_at: { lte: now } } });
    return result.count;
  }
}
