import { Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  AgentListQuerySchema,
  IdSchema,
  RecruitAgentSchema,
  UpdateAgentSchema,
  type Agent,
  type AgentListQuery,
  type RecruitAgent,
  type UpdateAgent,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam, ZodQuery } from '@/lib/validation/zod.decorator';
import { AgentService } from '@/modules/company/services/agent.service';

/** Recruit, edit and dismiss agents. */
@Controller('agents')
export class AgentController {
  constructor(private readonly agent_service: AgentService) {}

  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodQuery(AgentListQuerySchema) query: AgentListQuery,
  ): Promise<Agent[]> {
    return this.agent_service.list(owner.id, query);
  }

  @Post()
  recruit(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(RecruitAgentSchema) body: RecruitAgent,
  ): Promise<Agent> {
    return this.agent_service.recruit(owner.id, body);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Agent> {
    return this.agent_service.get(owner.id, id);
  }

  @Patch(':id')
  update(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(UpdateAgentSchema) body: UpdateAgent,
  ): Promise<Agent> {
    return this.agent_service.update(owner.id, id, body);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Agent> {
    return this.agent_service.dismiss(owner.id, id);
  }
}
