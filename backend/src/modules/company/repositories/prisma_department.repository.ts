import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import type { DepartmentRecord } from '@/modules/company/types/company_records';
import type { DepartmentRepository } from './interface/department_repository.interface';

/** Members that are neither dismissed nor terminated. */
const with_member_count = {
  _count: {
    select: {
      members: { where: { status: { notIn: ['dismissed' as const, 'terminated' as const] } } },
    },
  },
};

/** `DepartmentRepository` on Prisma. */
@Injectable()
export class PrismaDepartmentRepository implements DepartmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(owner_id: string): Promise<DepartmentRecord[]> {
    const rows = await this.prisma.department.findMany({
      where: { owner_id },
      include: with_member_count,
      orderBy: { created_at: 'asc' },
    });
    return rows.map(({ _count: counts, ...row }) => ({ ...row, member_count: counts.members }));
  }

  async find(owner_id: string, id: string): Promise<DepartmentRecord | null> {
    const row = await this.prisma.department.findFirst({
      where: { id, owner_id },
      include: with_member_count,
    });
    if (row === null) return null;
    const { _count: counts, ...rest } = row;
    return { ...rest, member_count: counts.members };
  }
}
