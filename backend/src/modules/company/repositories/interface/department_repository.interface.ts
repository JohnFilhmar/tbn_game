import type { DepartmentRecord } from '@/modules/company/types/company_records';

/** Injection token for `DepartmentRepository`. */
export const DEPARTMENT_REPOSITORY = Symbol('DEPARTMENT_REPOSITORY');

/** Department rows, scoped by owner. Departments are created with their manager. */
export interface DepartmentRepository {
  list(owner_id: string): Promise<DepartmentRecord[]>;
  find(owner_id: string, id: string): Promise<DepartmentRecord | null>;
  /** Gives the department a new name; null when it is missing. */
  rename(owner_id: string, id: string, name: string): Promise<DepartmentRecord | null>;
}
