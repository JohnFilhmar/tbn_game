import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import type { CapWindowRecord, CapWindowWrite } from '@/modules/runtime/types/cap_window_record';
import type { CapWindowRepository } from './interface/cap_window_repository.interface';

/** `CapWindowRepository` on Prisma. */
@Injectable()
export class PrismaCapWindowRepository implements CapWindowRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string, provider_id: string): Promise<CapWindowRecord[]> {
    return this.prisma.capWindow.findMany({
      where: { owner_id, provider_id },
      orderBy: { created_at: 'asc' },
    });
  }

  find(owner_id: string, provider_id: string, id: string): Promise<CapWindowRecord | null> {
    return this.prisma.capWindow.findFirst({ where: { id, owner_id, provider_id } });
  }

  create(owner_id: string, provider_id: string, data: CapWindowWrite): Promise<CapWindowRecord> {
    return this.prisma.capWindow.create({ data: { owner_id, provider_id, ...data } });
  }

  async update(
    owner_id: string,
    provider_id: string,
    id: string,
    data: Partial<CapWindowWrite>,
  ): Promise<CapWindowRecord | null> {
    const result = await this.prisma.capWindow.updateMany({
      where: { id, owner_id, provider_id },
      data,
    });
    return result.count === 0 ? null : this.find(owner_id, provider_id, id);
  }

  async delete(owner_id: string, provider_id: string, id: string): Promise<boolean> {
    const result = await this.prisma.capWindow.deleteMany({ where: { id, owner_id, provider_id } });
    return result.count === 1;
  }
}
