import type { DepartmentRecord } from '@/modules/company/types/company_records';

/** Injection token for `DepartmentRepository`. */
export const DEPARTMENT_REPOSITORY = Symbol('DEPARTMENT_REPOSITORY');

/** Department rows, scoped by owner. Departments are created with their manager. */
export interface DepartmentRepository {
  list(owner_id: string): Promise<DepartmentRecord[]>;
  find(owner_id: string, id: string): Promise<DepartmentRecord | null>;
}
