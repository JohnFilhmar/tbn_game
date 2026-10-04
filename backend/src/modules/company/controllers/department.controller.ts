import { Controller, Get, Patch } from '@nestjs/common';
import {
  IdSchema,
  UpdateDepartmentSchema,
  type Department,
  type UpdateDepartment,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { DepartmentService } from '@/modules/company/services/department.service';

/** Departments, one per manager, which the owner can rename. */
@Controller('departments')
export class DepartmentController {
  constructor(private readonly department_service: DepartmentService) {}

  @Get()
  list(@CurrentOwner() owner: AuthenticatedOwner): Promise<Department[]> {
    return this.department_service.list(owner.id);
  }

  @Patch(':id')
  rename(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(UpdateDepartmentSchema) body: UpdateDepartment,
  ): Promise<Department> {
    return this.department_service.rename(owner.id, id, body);
  }
}
