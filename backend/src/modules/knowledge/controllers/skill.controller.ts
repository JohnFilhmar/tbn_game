import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import {
  CreateSkillSchema,
  IdSchema,
  ImportSkillSchema,
  ReplaceSkillAttachmentsSchema,
  UpdateSkillSchema,
  type CreateSkill,
  type ImportSkill,
  type ReplaceSkillAttachments,
  type Skill,
  type UpdateSkill,
} from '@tbn/contracts';
import type { Response } from 'express';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { SkillService } from '@/modules/knowledge/services/skill.service';

/** Skills, their `SKILL.md` import and export, and their attachments. */
@Controller('skills')
export class SkillController {
  constructor(private readonly skill_service: SkillService) {}

  @Get()
  list(@CurrentOwner() owner: AuthenticatedOwner): Promise<Skill[]> {
    return this.skill_service.list(owner.id);
  }

  @Post()
  create(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(CreateSkillSchema) body: CreateSkill,
  ): Promise<Skill> {
    return this.skill_service.create(owner.id, body);
  }

  @Post('import')
  import(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(ImportSkillSchema) body: ImportSkill,
  ): Promise<Skill> {
    return this.skill_service.import(owner.id, body.markdown);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Skill> {
    return this.skill_service.get(owner.id, id);
  }

  @Patch(':id')
  update(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(UpdateSkillSchema) body: UpdateSkill,
  ): Promise<Skill> {
    return this.skill_service.update(owner.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<void> {
    return this.skill_service.delete(owner.id, id);
  }

  /** The skill as a `SKILL.md` file attachment. */
  @Get(':id/export')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async export(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.skill_service.export(owner.id, id);
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return file.markdown;
  }

  @Put(':id/attachments')
  replace_attachments(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(ReplaceSkillAttachmentsSchema) body: ReplaceSkillAttachments,
  ): Promise<Skill> {
    return this.skill_service.replace_attachments(owner.id, id, body.attachments);
  }
}
