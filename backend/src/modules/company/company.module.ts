import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/lib/database/database.module';
import { QueueModule } from '@/lib/queue/queue.module';
import { RuntimeProvidersModule } from '@/modules/runtime/runtime_providers.module';
import { AgentController } from './controllers/agent.controller';
import { DepartmentController } from './controllers/department.controller';
import { ReportController } from './controllers/report.controller';
import { TaskController } from './controllers/task.controller';
import { AGENT_REPOSITORY } from './repositories/interface/agent_repository.interface';
import { DEPARTMENT_REPOSITORY } from './repositories/interface/department_repository.interface';
import { REPORT_REPOSITORY } from './repositories/interface/report_repository.interface';
import { TASK_REPOSITORY } from './repositories/interface/task_repository.interface';
import { PrismaAgentRepository } from './repositories/prisma_agent.repository';
import { PrismaDepartmentRepository } from './repositories/prisma_department.repository';
import { PrismaReportRepository } from './repositories/prisma_report.repository';
import { PrismaTaskRepository } from './repositories/prisma_task.repository';
import { AgentService } from './services/agent.service';
import { DepartmentService } from './services/department.service';
import { ReportService } from './services/report.service';
import { TaskService } from './services/task.service';

/**
 * Departments, agents, roster, tasks and reports. Approvals and merge requests arrive in phase 1c.
 * A task assignment wakes the agent through the queue; the runtime does the rest and reports back
 * through the exported services.
 */
@Module({
  imports: [DatabaseModule, QueueModule, RuntimeProvidersModule],
  controllers: [AgentController, DepartmentController, TaskController, ReportController],
  providers: [
    { provide: AGENT_REPOSITORY, useClass: PrismaAgentRepository },
    { provide: DEPARTMENT_REPOSITORY, useClass: PrismaDepartmentRepository },
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
    { provide: REPORT_REPOSITORY, useClass: PrismaReportRepository },
    AgentService,
    DepartmentService,
    TaskService,
    ReportService,
  ],
  exports: [AgentService, DepartmentService, TaskService, ReportService],
})
export class CompanyModule {}
