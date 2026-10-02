import { Injectable } from '@nestjs/common';
import type { AgentListQuery, AgentStatus } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import type { AgentRecord, AgentWrite } from '@/modules/company/types/company_records';
import type { AgentRepository } from './interface/agent_repository.interface';

const MANAGER_LEVEL = 1;

/** `AgentRepository` on Prisma. */
@Injectable()
export class PrismaAgentRepository implements AgentRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string, query: AgentListQuery): Promise<AgentRecord[]> {
    return this.prisma.agent.findMany({
      where: {
        owner_id,
        ...(query.department_id !== undefined && { department_id: query.department_id }),
        ...(query.status !== undefined && { status: query.status }),
      },
      orderBy: { created_at: 'asc' },
    });
  }

  find(owner_id: string, id: string): Promise<AgentRecord | null> {
    return this.prisma.agent.findFirst({ where: { id, owner_id } });
  }

  find_by_name(owner_id: string, name: string): Promise<AgentRecord | null> {
    return this.prisma.agent.findFirst({ where: { owner_id, name } });
  }

  recruit_manager(owner_id: string, data: AgentWrite): Promise<AgentRecord> {
    return this.prisma.$transaction(async (tx) => {
      const department = await tx.department.create({ data: { owner_id, name: data.role } });
      const agent = await tx.agent.create({
        data: { owner_id, level: MANAGER_LEVEL, department_id: department.id, ...data },
      });
      await tx.department.update({
        where: { id: department.id },
        data: { manager_agent_id: agent.id },
      });
      return agent;
    });
  }

  async update(
    owner_id: string,
    id: string,
    data: Partial<AgentWrite>,
  ): Promise<AgentRecord | null> {
    const result = await this.prisma.agent.updateMany({ where: { id, owner_id }, data });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async set_status(owner_id: string, id: string, status: AgentStatus): Promise<AgentRecord | null> {
    const result = await this.prisma.agent.updateMany({
      where: { id, owner_id },
      data: { status },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async claim_run(owner_id: string, id: string, run_id: string): Promise<boolean> {
    const result = await this.prisma.agent.updateMany({
      where: { id, owner_id, active_run_id: null, status: 'idle' },
      data: { active_run_id: run_id, status: 'working' },
    });
    return result.count === 1;
  }

  async release_run(owner_id: string, id: string, run_id: string): Promise<void> {
    await this.prisma.agent.updateMany({
      where: { id, owner_id, active_run_id: run_id, status: 'working' },
      data: { active_run_id: null, status: 'idle' },
    });
    await this.prisma.agent.updateMany({
      where: { id, owner_id, active_run_id: run_id },
      data: { active_run_id: null },
    });
  }
}
