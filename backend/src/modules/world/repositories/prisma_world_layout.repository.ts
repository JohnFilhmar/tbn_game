import { Injectable } from '@nestjs/common';
import { is_unique_violation } from '@/lib/database/prisma_errors';
import { PrismaService } from '@/lib/database/prisma.service';
import type { WorldLayoutRecord, WorldLayoutWrite } from '@/modules/world/types/world_records';
import type { WorldLayoutRepository } from './interface/world_layout_repository.interface';

const RECORD = {
  id: true,
  environment: true,
  theme: true,
  placements: true,
  revision: true,
  updated_at: true,
} as const;

/** `WorldLayoutRepository` on Prisma. */
@Injectable()
export class PrismaWorldLayoutRepository implements WorldLayoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(owner_id: string, environment: string): Promise<WorldLayoutRecord | null> {
    return this.prisma.worldLayout.findFirst({ where: { owner_id, environment }, select: RECORD });
  }

  find_by_id(owner_id: string, id: string): Promise<WorldLayoutRecord | null> {
    return this.prisma.worldLayout.findFirst({ where: { owner_id, id }, select: RECORD });
  }

  async save(
    owner_id: string,
    environment: string,
    expected: number,
    layout: WorldLayoutWrite,
  ): Promise<WorldLayoutRecord | null> {
    const data = { theme: layout.theme, placements: [...layout.placements] };
    if (expected === 0) {
      try {
        return await this.prisma.worldLayout.create({
          data: { owner_id, environment, revision: 1, ...data },
          select: RECORD,
        });
      } catch (error: unknown) {
        if (is_unique_violation(error)) return null;
        throw error;
      }
    }
    // The revision in the filter makes the check and the write one statement.
    const { count } = await this.prisma.worldLayout.updateMany({
      where: { owner_id, environment, revision: expected },
      data: { ...data, revision: expected + 1 },
    });
    return count === 0 ? null : this.find(owner_id, environment);
  }

  async remove(owner_id: string, environment: string): Promise<void> {
    await this.prisma.worldLayout.deleteMany({ where: { owner_id, environment } });
  }
}
