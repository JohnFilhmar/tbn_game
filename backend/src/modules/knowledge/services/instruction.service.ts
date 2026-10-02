import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  instruction_target_problem,
  type CreateInstruction,
  type Instruction,
  type InstructionListQuery,
  type UpdateInstruction,
} from '@tbn/contracts';
import { AgentService } from '@/modules/company/services/agent.service';
import {
  INSTRUCTION_REPOSITORY,
  type InstructionRepository,
} from '@/modules/knowledge/repositories/interface/instruction_repository.interface';
import type {
  InstructionRecord,
  InstructionWrite,
} from '@/modules/knowledge/types/knowledge_records';

/** Maps an instruction row to the API shape. */
export function to_instruction_view(record: InstructionRecord): Instruction {
  return {
    id: record.id,
    scope: record.scope,
    role: record.role,
    agent_id: record.agent_id,
    title: record.title,
    body: record.body,
    position: record.position,
    enabled: record.enabled,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

/** Standing rules for every agent, a role, or one agent. Changes apply on the next model turn. */
@Injectable()
export class InstructionService {
  constructor(
    @Inject(INSTRUCTION_REPOSITORY) private readonly instructions: InstructionRepository,
    private readonly agents: AgentService,
  ) {}

  async list(owner_id: string, query: InstructionListQuery): Promise<Instruction[]> {
    return (await this.instructions.list(owner_id, query)).map(to_instruction_view);
  }

  async get(owner_id: string, id: string): Promise<Instruction> {
    return to_instruction_view(await this.require(owner_id, id));
  }

  async create(owner_id: string, input: CreateInstruction): Promise<Instruction> {
    const data: InstructionWrite = {
      scope: input.scope,
      role: input.role ?? null,
      agent_id: input.agent_id ?? null,
      title: input.title,
      body: input.body,
      position: input.position ?? 0,
      enabled: input.enabled ?? true,
    };
    await this.check_target(owner_id, data);
    return to_instruction_view(await this.instructions.create(owner_id, data));
  }

  async update(owner_id: string, id: string, input: UpdateInstruction): Promise<Instruction> {
    const current = await this.require(owner_id, id);
    const merged: InstructionWrite = {
      scope: input.scope ?? current.scope,
      role: input.role !== undefined ? input.role : current.role,
      agent_id: input.agent_id !== undefined ? input.agent_id : current.agent_id,
      title: input.title ?? current.title,
      body: input.body ?? current.body,
      position: input.position ?? current.position,
      enabled: input.enabled ?? current.enabled,
    };
    await this.check_target(owner_id, merged);
    const record = await this.instructions.update(owner_id, id, merged);
    if (record === null) throw new NotFoundException('Instruction not found');
    return to_instruction_view(record);
  }

  async delete(owner_id: string, id: string): Promise<void> {
    if (!(await this.instructions.delete(owner_id, id))) {
      throw new NotFoundException('Instruction not found');
    }
  }

  /** The enabled instructions that apply to one agent, in prompt order. */
  async for_prompt(owner_id: string, role: string, agent_id: string): Promise<Instruction[]> {
    return (await this.instructions.find_for_prompt(owner_id, role, agent_id)).map(
      to_instruction_view,
    );
  }

  private async require(owner_id: string, id: string): Promise<InstructionRecord> {
    const record = await this.instructions.find(owner_id, id);
    if (record === null) throw new NotFoundException('Instruction not found');
    return record;
  }

  private async check_target(owner_id: string, data: InstructionWrite): Promise<void> {
    const problem = instruction_target_problem(data.scope, data.role, data.agent_id);
    if (problem !== null) throw new BadRequestException(problem);
    if (data.agent_id !== null && !(await this.agents.exists(owner_id, data.agent_id))) {
      throw new NotFoundException('Agent not found');
    }
  }
}
