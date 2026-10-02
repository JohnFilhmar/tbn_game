import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import type {
  SearchProviderRecord,
  SearchProviderWrite,
} from '@/modules/runtime/types/search_provider_record';
import type { SearchProviderRepository } from './interface/search_provider_repository.interface';

/** `SearchProviderRepository` on Prisma. */
@Injectable()
export class PrismaSearchProviderRepository implements SearchProviderRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string): Promise<SearchProviderRecord[]> {
    return this.prisma.searchProvider.findMany({
      where: { owner_id },
      orderBy: [{ priority: 'asc' }, { created_at: 'asc' }],
    });
  }

  find(owner_id: string, id: string): Promise<SearchProviderRecord | null> {
    return this.prisma.searchProvider.findFirst({ where: { id, owner_id } });
  }

  find_by_name(owner_id: string, name: string): Promise<SearchProviderRecord | null> {
    return this.prisma.searchProvider.findFirst({ where: { owner_id, name } });
  }

  create(owner_id: string, write: SearchProviderWrite): Promise<SearchProviderRecord> {
    return this.prisma.searchProvider.create({ data: { owner_id, ...write } });
  }

  async update(
    owner_id: string,
    id: string,
    write: Partial<SearchProviderWrite>,
  ): Promise<SearchProviderRecord | null> {
    const result = await this.prisma.searchProvider.updateMany({
      where: { id, owner_id },
      data: write,
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const result = await this.prisma.searchProvider.deleteMany({ where: { id, owner_id } });
    return result.count > 0;
  }
}
