import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  CreateTaskSchema,
  IdSchema,
  TaskListQuerySchema,
  type CreateTask,
  type Task,
  type TaskListQuery,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam, ZodQuery } from '@/lib/validation/zod.decorator';
import { TaskService } from '@/modules/company/services/task.service';

/** The task board. */
@Controller('tasks')
export class TaskController {
  constructor(private readonly task_service: TaskService) {}

  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodQuery(TaskListQuerySchema) query: TaskListQuery,
  ): Promise<Task[]> {
    return this.task_service.list(owner.id, query);
  }

  @Post()
  create(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(CreateTaskSchema) body: CreateTask,
  ): Promise<Task> {
    return this.task_service.create(owner.id, body);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Task> {
    return this.task_service.get(owner.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Task> {
    return this.task_service.cancel(owner.id, id);
  }
}
