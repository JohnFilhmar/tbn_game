import { Injectable } from '@nestjs/common';
import { SkillNameSchema } from '@tbn/contracts';
import { z } from 'zod';
import { SkillService } from '@/modules/knowledge/services/skill.service';
import type { Tool, ToolContext, ToolOutcome } from './tool.interface';

/** Loads the full body of a skill the system prompt only listed by name. */
@Injectable()
export class LoadSkillTool implements Tool<{ name: string }> {
  readonly name = 'load_skill';
  readonly description =
    'Load the full instructions of one of the skills listed in your system prompt, by name.';
  readonly default_policy = 'auto';
  readonly input_schema = z.strictObject({ name: SkillNameSchema.describe('The skill name') });

  constructor(private readonly skills: SkillService) {}

  async execute(input: { name: string }, context: ToolContext): Promise<ToolOutcome> {
    const body = await this.skills.body_by_name(context.owner_id, input.name);
    if (body === null) return { content: `No skill named ${input.name}`, is_error: true };
    return { content: body };
  }
}
