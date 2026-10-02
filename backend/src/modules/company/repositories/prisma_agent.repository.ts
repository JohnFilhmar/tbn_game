import { Injectable } from '@nestjs/common';
import { OPEN_TASK_STATUSES, type AgentListQuery, type AgentStatus } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import { is_unique_violation } from '@/lib/database/prisma_errors';
import type {
  AgentRecord,
  AgentWrite,
  IdleInternRecord,
  InternWrite,
  RosterAgentRecord,
} from '@/modules/company/types/company_records';
import type { AgentRepository, LiveAgentFilter } from './interface/agent_repository.interface';

const MANAGER_LEVEL = 1;
const INTERN_LEVEL = 2;
const GONE: AgentStatus[] = ['dismissed', 'terminated'];

/** Two spawns may race for the same number; the loser takes the next one. */
const NAME_ATTEMPTS = 5;

const no_open_task = { assigned_tasks: { none: { status: { in: [...OPEN_TASK_STATUSES] } } } };

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
        ...(query.level !== undefined && { level: query.level }),
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

  async spawn_intern(
    owner_id: string,
    name_prefix: string,
    data: InternWrite,
  ): Promise<AgentRecord> {
    const spawned = await this.prisma.agent.count({
      where: { owner_id, department_id: data.department_id, level: INTERN_LEVEL },
    });
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.agent.create({
          data: {
            owner_id,
            level: INTERN_LEVEL,
            name: `${name_prefix} intern ${spawned + attempt}`,
            role: data.role,
            job_description: data.job_description,
            department_id: data.department_id,
            provider_id: data.provider_id,
            primary_model: data.primary_model,
            intern_model: data.primary_model,
            tool_policy: data.tool_policy,
          },
        });
      } catch (error: unknown) {
        if (!is_unique_violation(error) || attempt >= NAME_ATTEMPTS) throw error;
      }
    }
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
      data: { active_run_id: run_id, status: 'working', idle_since: null },
    });
    return result.count === 1;
  }

  async release_run(owner_id: string, id: string, run_id: string): Promise<void> {
    await this.prisma.agent.updateMany({
      where: { id, owner_id, active_run_id: run_id, status: 'working' },
      data: { active_run_id: null, status: 'idle', idle_since: new Date() },
    });
    await this.prisma.agent.updateMany({
      where: { id, owner_id, active_run_id: run_id },
      data: { active_run_id: null },
    });
  }

  idle_interns(owner_id: string, department_id: string): Promise<AgentRecord[]> {
    return this.prisma.agent.findMany({
      where: {
        owner_id,
        department_id,
        level: INTERN_LEVEL,
        status: 'idle',
        active_run_id: null,
        ...no_open_task,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  count_live(owner_id: string, filter: LiveAgentFilter): Promise<number> {
    return this.prisma.agent.count({
      where: {
        owner_id,
        status: { notIn: GONE },
        ...(filter.department_id !== undefined && { department_id: filter.department_id }),
        ...(filter.level !== undefined && { level: filter.level }),
      },
    });
  }

  async list_live(owner_id: string): Promise<RosterAgentRecord[]> {
    const rows = await this.prisma.agent.findMany({
      where: { owner_id, status: { notIn: GONE } },
      include: { department: { select: { name: true } } },
      orderBy: { created_at: 'asc' },
    });
    return rows.map(({ department, ...agent }) => ({ agent, department_name: department.name }));
  }

  list_on_provider(owner_id: string, provider_id: string): Promise<AgentRecord[]> {
    return this.prisma.agent.findMany({
      where: { owner_id, provider_id, status: { notIn: GONE } },
      orderBy: { created_at: 'asc' },
    });
  }

  async terminate_idle_intern(
    owner_id: string,
    id: string,
    idle_before: Date | null,
  ): Promise<boolean> {
    const result = await this.prisma.agent.updateMany({
      where: {
        id,
        owner_id,
        level: INTERN_LEVEL,
        status: 'idle',
        active_run_id: null,
        ...(idle_before !== null && { idle_since: { lt: idle_before } }),
        ...no_open_task,
      },
      data: { status: 'terminated', idle_since: null },
    });
    return result.count === 1;
  }

  async find_idle_interns(): Promise<IdleInternRecord[]> {
    const rows = await this.prisma.agent.findMany({
      where: { level: INTERN_LEVEL, status: 'idle', active_run_id: null },
      select: {
        id: true,
        owner_id: true,
        idle_since: true,
        department: { select: { manager: { select: { status: true } } } },
      },
      orderBy: { idle_since: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      owner_id: row.owner_id,
      idle_since: row.idle_since,
      manager_status: row.department.manager?.status ?? null,
    }));
  }
}
