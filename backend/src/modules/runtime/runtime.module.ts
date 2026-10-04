import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/lib/database/database.module';
import { MetricsModule } from '@/lib/metrics/metrics.module';
import { QueueModule } from '@/lib/queue/queue.module';
import { RealtimeModule } from '@/lib/realtime/realtime.module';
import { CompanyModule } from '@/modules/company/company.module';
import { IntegrationsModule } from '@/modules/integrations/integrations.module';
import { KnowledgeModule } from '@/modules/knowledge/knowledge.module';
import { ApprovalController } from './controllers/approval.controller';
import { CacheController } from './controllers/cache.controller';
import { CapWindowController } from './controllers/cap_window.controller';
import {
  BranchReviewController,
  MergeRequestController,
  RepositoryController,
} from './controllers/repository.controller';
import { RunController } from './controllers/run.controller';
import { SandboxJobController } from './controllers/sandbox_job.controller';
import { TranscriptController } from './controllers/transcript.controller';
import { APPROVAL_REPOSITORY } from './repositories/interface/approval_repository.interface';
import { RUN_REPOSITORY } from './repositories/interface/run_repository.interface';
import { RUN_SOURCE_REPOSITORY } from './repositories/interface/run_source_repository.interface';
import { SANDBOX_JOB_REPOSITORY } from './repositories/interface/sandbox_job_repository.interface';
import { TRANSCRIPT_REPOSITORY } from './repositories/interface/transcript_repository.interface';
import { WEB_CACHE_REPOSITORY } from './repositories/interface/web_cache_repository.interface';
import { PrismaApprovalRepository } from './repositories/prisma_approval.repository';
import { PrismaRunRepository } from './repositories/prisma_run.repository';
import { PrismaRunSourceRepository } from './repositories/prisma_run_source.repository';
import { PrismaSandboxJobRepository } from './repositories/prisma_sandbox_job.repository';
import { PrismaTranscriptRepository } from './repositories/prisma_transcript.repository';
import { PrismaWebCacheRepository } from './repositories/prisma_web_cache.repository';
import { RuntimeProvidersModule } from './runtime_providers.module';
import { AgentWakeService } from './services/agent_wake.service';
import { ApprovalService } from './services/approvals/approval.service';
import { RunControlService } from './services/approvals/run_control.service';
import { CapNotifierService } from './services/caps/cap_notifier.service';
import { CapWindowService } from './services/caps/cap_window.service';
import { AgentBranchesService } from './services/git/agent_branches.service';
import { GitJobService } from './services/git/git_job.service';
import { GitRepositoryService } from './services/git/git_repository.service';
import { DashboardMetricsService } from './services/ops/dashboard_metrics.service';
import { PromptBuilderService } from './services/prompt_builder.service';
import { CompactionService } from './services/run_loop/compaction.service';
import { RunGateService } from './services/run_loop/run_gate.service';
import { RunLeaseService } from './services/run_loop/run_lease.service';
import { RunLoopService } from './services/run_loop/run_loop.service';
import { QuestionReplyService } from './services/run_loop/question_reply.service';
import { SubtaskDeliveryService } from './services/run_loop/subtask_delivery.service';
import { TaskCompletionService } from './services/run_loop/task_completion.service';
import { TurnService } from './services/run_loop/turn.service';
import { SandboxJobService } from './services/sandbox/sandbox_job.service';
import { RunSourceService } from './services/taint/run_source.service';
import { CacheStatsService } from './services/web/cache_stats.service';
import { FetchUrlService } from './services/web/fetch_url.service';
import { LibraryService } from './services/web/library.service';
import { WebSearchService } from './services/web/web_search.service';
import { RunService } from './services/run.service';
import { TranscriptService } from './services/transcript.service';
import { WorkerSweepService } from './services/worker_sweep.service';
import { DelegateTaskTool } from './tools/delegate_task.tool';
import { FetchUrlTool } from './tools/fetch_url.tool';
import { ListFilesTool, ReadFileTool, WriteFileTool } from './tools/file_tools';
import { DeclineTaskTool } from './tools/decline_task.tool';
import { FinishTaskTool } from './tools/finish_task.tool';
import { GitCheckoutTool } from './tools/git/git_checkout.tool';
import { GitPublishTool } from './tools/git/git_publish.tool';
import { GitDiffTool, GitLogTool, GitReadSupport } from './tools/git/git_read.tools';
import { MergeFeatureBranchTool } from './tools/git/merge_feature_branch.tool';
import { OpenMergeRequestTool } from './tools/git/open_merge_request.tool';
import { ReviewBranchTool } from './tools/git/review_branch.tool';
import { ListRosterTool } from './tools/list_roster.tool';
import { LoadSkillTool } from './tools/load_skill.tool';
import { RunCommandTool } from './tools/run_command.tool';
import { SearchLibraryTool } from './tools/search_library.tool';
import { SendMessageTool } from './tools/send_message.tool';
import { ToolExecutorService } from './tools/tool_executor.service';
import { ToolRegistryService } from './tools/tool_registry.service';
import { WebSearchTool } from './tools/web_search.tool';

/**
 * Run loop, checkpoints, tools, and the transcript of every agent: delegation to interns, paused
 * runs, the runaway guard, compaction and condensed reports. Providers and caps live in
 * `RuntimeProvidersModule`. The worker registers the wake handler and the sweep; the web process
 * only serves the routes.
 */
@Module({
  imports: [
    DatabaseModule,
    MetricsModule,
    QueueModule,
    RealtimeModule,
    RuntimeProvidersModule,
    CompanyModule,
    KnowledgeModule,
    IntegrationsModule,
  ],
  controllers: [
    RunController,
    TranscriptController,
    CapWindowController,
    SandboxJobController,
    CacheController,
    RepositoryController,
    MergeRequestController,
    BranchReviewController,
    ApprovalController,
  ],
  providers: [
    { provide: RUN_REPOSITORY, useClass: PrismaRunRepository },
    { provide: TRANSCRIPT_REPOSITORY, useClass: PrismaTranscriptRepository },
    { provide: SANDBOX_JOB_REPOSITORY, useClass: PrismaSandboxJobRepository },
    { provide: WEB_CACHE_REPOSITORY, useClass: PrismaWebCacheRepository },
    { provide: RUN_SOURCE_REPOSITORY, useClass: PrismaRunSourceRepository },
    { provide: APPROVAL_REPOSITORY, useClass: PrismaApprovalRepository },
    RunControlService,
    ApprovalService,
    SandboxJobService,
    RunSourceService,
    WebSearchService,
    FetchUrlService,
    LibraryService,
    CacheStatsService,
    GitJobService,
    AgentBranchesService,
    GitRepositoryService,
    ListFilesTool,
    ReadFileTool,
    WriteFileTool,
    LoadSkillTool,
    ListRosterTool,
    SendMessageTool,
    DelegateTaskTool,
    FinishTaskTool,
    DeclineTaskTool,
    RunCommandTool,
    GitCheckoutTool,
    GitPublishTool,
    GitReadSupport,
    GitDiffTool,
    GitLogTool,
    ReviewBranchTool,
    MergeFeatureBranchTool,
    OpenMergeRequestTool,
    SearchLibraryTool,
    WebSearchTool,
    FetchUrlTool,
    ToolRegistryService,
    ToolExecutorService,
    PromptBuilderService,
    RunLeaseService,
    RunGateService,
    TaskCompletionService,
    CompactionService,
    SubtaskDeliveryService,
    QuestionReplyService,
    TurnService,
    RunLoopService,
    WorkerSweepService,
    AgentWakeService,
    RunService,
    TranscriptService,
    CapWindowService,
    CapNotifierService,
    DashboardMetricsService,
  ],
  exports: [
    RuntimeProvidersModule,
    RunService,
    TranscriptService,
    AgentWakeService,
    WorkerSweepService,
    SandboxJobService,
    RunSourceService,
    ApprovalService,
    CapWindowService,
  ],
})
export class RuntimeModule {}
