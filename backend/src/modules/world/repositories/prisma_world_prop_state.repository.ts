import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import type { WorldPropStateRecord } from '@/modules/world/types/world_records';
import type {
  WorldPropStateRepository,
  WorldPropStateWrite,
} from './interface/world_prop_state_repository.interface';

const RECORD = {
  id: true,
  environment: true,
  placement_id: true,
  kind: true,
  state: true,
  updated_at: true,
} as const;

/** `WorldPropStateRepository` on Prisma. */
@Injectable()
export class PrismaWorldPropStateRepository implements WorldPropStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string, environment: string): Promise<WorldPropStateRecord[]> {
    return this.prisma.worldPropState.findMany({
      where: { owner_id, environment },
      select: RECORD,
      orderBy: { id: 'asc' },
    });
  }

  find_by_id(owner_id: string, id: string): Promise<WorldPropStateRecord | null> {
    return this.prisma.worldPropState.findFirst({ where: { owner_id, id }, select: RECORD });
  }

  save(owner_id: string, write: WorldPropStateWrite): Promise<WorldPropStateRecord> {
    const { placement_id, ...fields } = write;
    return this.prisma.worldPropState.upsert({
      where: { owner_id_placement_id: { owner_id, placement_id } },
      create: { owner_id, placement_id, ...fields },
      update: fields,
      select: RECORD,
    });
  }
}
