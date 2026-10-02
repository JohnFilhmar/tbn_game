import { PROTECTED_BRANCHES } from '@tbn/contracts';

/** The longest a slug gets, so branch names stay readable. */
const SLUG_CHARS = 40;

/** The branch all work starts from and merge requests go to. */
export const BASE_BRANCH = 'development';

/** A name as a branch path segment: lowercase letters, digits and dashes. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_CHARS)
    .replace(/-+$/, '');
  return slug.length > 0 ? slug : 'agent';
}

/** The namespace of a department's branches: its manager's name as a slug. */
export function department_prefix(manager_name: string): string {
  return slugify(manager_name);
}

/** The branch a manager integrates its department's work on: `<manager>/main`. */
export function manager_branch_name(manager_name: string): string {
  return `${department_prefix(manager_name)}/main`;
}

/**
 * The feature branch of an intern's task: `<manager>/<task slug>-<suffix>`, in the manager's
 * namespace. The suffix keeps two tasks with one title apart.
 */
export function feature_branch_name(
  manager_name: string,
  task_title: string,
  suffix: string,
): string {
  return `${department_prefix(manager_name)}/${slugify(task_title)}-${suffix}`;
}

/** True when the branch is a feature branch of the department, not its manager branch. */
export function is_department_feature_branch(branch: string, manager_name: string): boolean {
  const prefix = `${department_prefix(manager_name)}/`;
  return branch.startsWith(prefix) && branch !== manager_branch_name(manager_name);
}

/** True for the branches no agent writes: the default branch, `development` and `staging`. */
export function is_protected_branch(branch: string, default_branch: string): boolean {
  return branch === default_branch || PROTECTED_BRANCHES.includes(branch);
}
