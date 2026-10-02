import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import type { OwnerRecord } from '@/modules/identity/types/owner_record';
import type { OwnerRepository } from './interface/owner_repository.interface';

/** `OwnerRepository` on Prisma. */
@Injectable()
export class PrismaOwnerRepository implements OwnerRepository {
  constructor(private readonly prisma: PrismaService) {}

  find_by_username(username: string): Promise<OwnerRecord | null> {
    return this.prisma.owner.findUnique({ where: { username } });
  }

  find_by_id(id: string): Promise<OwnerRecord | null> {
    return this.prisma.owner.findUnique({ where: { id } });
  }

  create(username: string, password_hash: string): Promise<OwnerRecord> {
    return this.prisma.owner.create({ data: { username, password_hash } });
  }

  count(): Promise<number> {
    return this.prisma.owner.count();
  }
}
