import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/lib/database/database.module';
import { QueueModule } from '@/lib/queue/queue.module';
import { CompanyModule } from '@/modules/company/company.module';
import { KnowledgeModule } from '@/modules/knowledge/knowledge.module';
import { CapWindowController } from './controllers/cap_window.controller';
import { RunController } from './controllers/run.controller';
import { TranscriptController } from './controllers/transcript.controller';
import { RUN_REPOSITORY } from './repositories/interface/run_repository.interface';
import { TRANSCRIPT_REPOSITORY } from './repositories/interface/transcript_repository.interface';
import { PrismaRunRepository } from './repositories/prisma_run.repository';
import { PrismaTranscriptRepository } from './repositories/prisma_transcript.repository';
import { RuntimeProvidersModule } from './runtime_providers.module';
import { AgentWakeService } from './services/agent_wake.service';
import { CapWindowService } from './services/caps/cap_window.service';
import { PromptBuilderService } from './services/prompt_builder.service';
import { CompactionService } from './services/run_loop/compaction.service';
import { RunGateService } from './services/run_loop/run_gate.service';
import { RunLeaseService } from './services/run_loop/run_lease.service';
import { RunLoopService } from './services/run_loop/run_loop.service';
import { SubtaskDeliveryService } from './services/run_loop/subtask_delivery.service';
import { TaskCompletionService } from './services/run_loop/task_completion.service';
import { TurnService } from './services/run_loop/turn.service';
import { RunService } from './services/run.service';
import { TranscriptService } from './services/transcript.service';
import { WorkerSweepService } from './services/worker_sweep.service';
import { DelegateTaskTool } from './tools/delegate_task.tool';
import { ListFilesTool, ReadFileTool, WriteFileTool } from './tools/file_tools';
import { FinishTaskTool } from './tools/finish_task.tool';
import { ListRosterTool } from './tools/list_roster.tool';
import { LoadSkillTool } from './tools/load_skill.tool';
import { SendMessageTool } from './tools/send_message.tool';
import { ToolExecutorService } from './tools/tool_executor.service';
import { ToolRegistryService } from './tools/tool_registry.service';

/**
 * Run loop, checkpoints, tools, and the transcript of every agent: delegation to interns, paused
 * runs, the runaway guard, compaction and condensed reports. Providers and caps live in
 * `RuntimeProvidersModule`. The worker registers the wake handler and the sweep; the web process
 * only serves the routes.
 */
@Module({
  imports: [DatabaseModule, QueueModule, RuntimeProvidersModule, CompanyModule, KnowledgeModule],
  controllers: [RunController, TranscriptController, CapWindowController],
  providers: [
    { provide: RUN_REPOSITORY, useClass: PrismaRunRepository },
    { provide: TRANSCRIPT_REPOSITORY, useClass: PrismaTranscriptRepository },
    ListFilesTool,
    ReadFileTool,
    WriteFileTool,
    LoadSkillTool,
    ListRosterTool,
    SendMessageTool,
    DelegateTaskTool,
    FinishTaskTool,
    ToolRegistryService,
    ToolExecutorService,
    PromptBuilderService,
    RunLeaseService,
    RunGateService,
    TaskCompletionService,
    CompactionService,
    SubtaskDeliveryService,
    TurnService,
    RunLoopService,
    WorkerSweepService,
    AgentWakeService,
    RunService,
    TranscriptService,
    CapWindowService,
  ],
  exports: [
    RuntimeProvidersModule,
    RunService,
    TranscriptService,
    AgentWakeService,
    WorkerSweepService,
  ],
})
export class RuntimeModule {}
