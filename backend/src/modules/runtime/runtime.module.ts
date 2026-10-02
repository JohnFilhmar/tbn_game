import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/lib/database/database.module';
import { QueueModule } from '@/lib/queue/queue.module';
import { CompanyModule } from '@/modules/company/company.module';
import { KnowledgeModule } from '@/modules/knowledge/knowledge.module';
import { RunController } from './controllers/run.controller';
import { TranscriptController } from './controllers/transcript.controller';
import { RUN_REPOSITORY } from './repositories/interface/run_repository.interface';
import { TRANSCRIPT_REPOSITORY } from './repositories/interface/transcript_repository.interface';
import { PrismaRunRepository } from './repositories/prisma_run.repository';
import { PrismaTranscriptRepository } from './repositories/prisma_transcript.repository';
import { RuntimeProvidersModule } from './runtime_providers.module';
import { AgentWakeService } from './services/agent_wake.service';
import { PromptBuilderService } from './services/prompt_builder.service';
import { RunLoopService } from './services/run_loop.service';
import { RunService } from './services/run.service';
import { TranscriptService } from './services/transcript.service';
import { ListFilesTool, ReadFileTool, WriteFileTool } from './tools/file_tools';
import { FinishTaskTool } from './tools/finish_task.tool';
import { LoadSkillTool } from './tools/load_skill.tool';
import { ToolExecutorService } from './tools/tool_executor.service';
import { ToolRegistryService } from './tools/tool_registry.service';

/**
 * Run loop, checkpoints, tools, and the transcript of every agent. Providers live in
 * `RuntimeProvidersModule`. The worker registers the wake handler; the web process only serves
 * the routes.
 */
@Module({
  imports: [DatabaseModule, QueueModule, RuntimeProvidersModule, CompanyModule, KnowledgeModule],
  controllers: [RunController, TranscriptController],
  providers: [
    { provide: RUN_REPOSITORY, useClass: PrismaRunRepository },
    { provide: TRANSCRIPT_REPOSITORY, useClass: PrismaTranscriptRepository },
    ListFilesTool,
    ReadFileTool,
    WriteFileTool,
    LoadSkillTool,
    FinishTaskTool,
    ToolRegistryService,
    ToolExecutorService,
    PromptBuilderService,
    RunLoopService,
    AgentWakeService,
    RunService,
    TranscriptService,
  ],
  exports: [RuntimeProvidersModule, RunService, TranscriptService, AgentWakeService],
})
export class RuntimeModule {}
