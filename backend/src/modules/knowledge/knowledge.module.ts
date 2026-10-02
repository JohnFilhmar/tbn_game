import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/lib/database/database.module';
import { CompanyModule } from '@/modules/company/company.module';
import { InstructionController } from './controllers/instruction.controller';
import { PreferenceController } from './controllers/preference.controller';
import { SkillController } from './controllers/skill.controller';
import { INSTRUCTION_REPOSITORY } from './repositories/interface/instruction_repository.interface';
import { PREFERENCE_REPOSITORY } from './repositories/interface/preference_repository.interface';
import { SKILL_REPOSITORY } from './repositories/interface/skill_repository.interface';
import { PrismaInstructionRepository } from './repositories/prisma_instruction.repository';
import { PrismaPreferenceRepository } from './repositories/prisma_preference.repository';
import { PrismaSkillRepository } from './repositories/prisma_skill.repository';
import { InstructionService } from './services/instruction.service';
import { PreferenceService } from './services/preference.service';
import { SkillService } from './services/skill.service';

/**
 * Instructions, skills and preferences, edited from the virtual desktop and read by the runtime on
 * every model turn. Plugins arrive in phase 1c.
 */
@Module({
  imports: [DatabaseModule, CompanyModule],
  controllers: [InstructionController, SkillController, PreferenceController],
  providers: [
    { provide: INSTRUCTION_REPOSITORY, useClass: PrismaInstructionRepository },
    { provide: SKILL_REPOSITORY, useClass: PrismaSkillRepository },
    { provide: PREFERENCE_REPOSITORY, useClass: PrismaPreferenceRepository },
    InstructionService,
    SkillService,
    PreferenceService,
  ],
  exports: [InstructionService, SkillService, PreferenceService],
})
export class KnowledgeModule {}
