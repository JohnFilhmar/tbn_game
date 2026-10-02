import { Controller, Get } from '@nestjs/common';
import type { Department } from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { DepartmentService } from '@/modules/company/services/department.service';

/** Departments, one per manager. */
@Controller('departments')
export class DepartmentController {
  constructor(private readonly department_service: DepartmentService) {}

  @Get()
  list(@CurrentOwner() owner: AuthenticatedOwner): Promise<Department[]> {
    return this.department_service.list(owner.id);
  }
}
