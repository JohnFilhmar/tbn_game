import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  CreateInstructionSchema,
  IdSchema,
  InstructionListQuerySchema,
  UpdateInstructionSchema,
  type CreateInstruction,
  type Instruction,
  type InstructionListQuery,
  type UpdateInstruction,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam, ZodQuery } from '@/lib/validation/zod.decorator';
import { InstructionService } from '@/modules/knowledge/services/instruction.service';

/** Standing instructions for agents. */
@Controller('instructions')
export class InstructionController {
  constructor(private readonly instruction_service: InstructionService) {}

  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodQuery(InstructionListQuerySchema) query: InstructionListQuery,
  ): Promise<Instruction[]> {
    return this.instruction_service.list(owner.id, query);
  }

  @Post()
  create(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(CreateInstructionSchema) body: CreateInstruction,
  ): Promise<Instruction> {
    return this.instruction_service.create(owner.id, body);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Instruction> {
    return this.instruction_service.get(owner.id, id);
  }

  @Patch(':id')
  update(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(UpdateInstructionSchema) body: UpdateInstruction,
  ): Promise<Instruction> {
    return this.instruction_service.update(owner.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<void> {
    return this.instruction_service.delete(owner.id, id);
  }
}
