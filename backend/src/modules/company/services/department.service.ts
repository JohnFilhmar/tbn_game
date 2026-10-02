import { Inject, Injectable } from '@nestjs/common';
import type { Department } from '@tbn/contracts';
import {
  DEPARTMENT_REPOSITORY,
  type DepartmentRepository,
} from '@/modules/company/repositories/interface/department_repository.interface';
import type { DepartmentRecord } from '@/modules/company/types/company_records';

/** Maps a department row to the API shape. */
export function to_department_view(record: DepartmentRecord): Department {
  return {
    id: record.id,
    name: record.name,
    manager_agent_id: record.manager_agent_id,
    member_count: record.member_count,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

/** Departments. Each is created with its manager. */
@Injectable()
export class DepartmentService {
  constructor(@Inject(DEPARTMENT_REPOSITORY) private readonly departments: DepartmentRepository) {}

  async list(owner_id: string): Promise<Department[]> {
    return (await this.departments.list(owner_id)).map(to_department_view);
  }
}
