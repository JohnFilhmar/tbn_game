import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/lib/database/database.module';
import { QueueModule } from '@/lib/queue/queue.module';
import { IntegrationsModule } from '@/modules/integrations/integrations.module';
import { RuntimeProvidersModule } from '@/modules/runtime/runtime_providers.module';
import { AgentController } from './controllers/agent.controller';
import { AgentAttachmentController } from './controllers/agent_attachment.controller';
import { DepartmentController } from './controllers/department.controller';
import { ReportController } from './controllers/report.controller';
import { TaskController } from './controllers/task.controller';
import { AGENT_REPOSITORY } from './repositories/interface/agent_repository.interface';
import { DEPARTMENT_REPOSITORY } from './repositories/interface/department_repository.interface';
import {
  BRANCH_REVIEW_REPOSITORY,
  MERGE_REQUEST_REPOSITORY,
  REPOSITORY_REPOSITORY,
} from './repositories/interface/git_repositories.interface';
import { REPORT_REPOSITORY } from './repositories/interface/report_repository.interface';
import { TASK_REPOSITORY } from './repositories/interface/task_repository.interface';
import { PrismaAgentRepository } from './repositories/prisma_agent.repository';
import { PrismaDepartmentRepository } from './repositories/prisma_department.repository';
import {
  PrismaBranchReviewRepository,
  PrismaMergeRequestRepository,
  PrismaRepositoryRepository,
} from './repositories/prisma_git.repositories';
import { PrismaReportRepository } from './repositories/prisma_report.repository';
import { PrismaTaskRepository } from './repositories/prisma_task.repository';
import { AgentService } from './services/agent.service';
import { AgentAttachmentService } from './services/agent_attachment.service';
import { DepartmentService } from './services/department.service';
import { GitRecordsService } from './services/git_records.service';
import { ReportService } from './services/report.service';
import { TaskService } from './services/task.service';

/**
 * Departments, agents, roster, tasks, reports, and the rows of the company's git work:
 * repositories, merge requests and branch reviews. A task assignment wakes the agent through the
 * queue; the runtime does the rest and reports back through the exported services.
 */
@Module({
  imports: [DatabaseModule, QueueModule, RuntimeProvidersModule, IntegrationsModule],
  controllers: [
    AgentController,
    AgentAttachmentController,
    DepartmentController,
    TaskController,
    ReportController,
  ],
  providers: [
    { provide: AGENT_REPOSITORY, useClass: PrismaAgentRepository },
    { provide: DEPARTMENT_REPOSITORY, useClass: PrismaDepartmentRepository },
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
    { provide: REPORT_REPOSITORY, useClass: PrismaReportRepository },
    { provide: REPOSITORY_REPOSITORY, useClass: PrismaRepositoryRepository },
    { provide: MERGE_REQUEST_REPOSITORY, useClass: PrismaMergeRequestRepository },
    { provide: BRANCH_REVIEW_REPOSITORY, useClass: PrismaBranchReviewRepository },
    GitRecordsService,
    AgentService,
    AgentAttachmentService,
    DepartmentService,
    TaskService,
    ReportService,
  ],
  exports: [
    AgentService,
    AgentAttachmentService,
    DepartmentService,
    TaskService,
    ReportService,
    GitRecordsService,
  ],
})
export class CompanyModule {}
