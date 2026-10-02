import { Injectable } from '@nestjs/common';
import { AgentService } from '@/modules/company/services/agent.service';
import { DepartmentService } from '@/modules/company/services/department.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord, TaskRecord } from '@/modules/company/types/company_records';
import { is_department_feature_branch, manager_branch_name } from './branch_rules';

/** Raised when an agent asks for a branch the rules do not give it. */
export class BranchRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BranchRuleError';
  }
}

/** An agent's place in its department's branches. */
export interface DepartmentBranches {
  /** The manager: the agent itself, or its department's manager for an intern. */
  manager: AgentRecord;
  /** `<manager>/main`. */
  manager_branch: string;
}

/**
 * The branch rules as they apply to one agent: which branch it works on, which it may publish,
 * which it may review. Interns own the feature branches of their tasks and managers own their
 * manager branch; nobody owns `development`, `staging` or the default branch.
 */
@Injectable()
export class AgentBranchesService {
  constructor(
    private readonly agents: AgentService,
    private readonly departments: DepartmentService,
    private readonly tasks: TaskService,
  ) {}

  /** @throws BranchRuleError when an intern's department has no manager any more. */
  async department_of(agent: AgentRecord): Promise<DepartmentBranches> {
    let manager = agent;
    if (agent.level !== 1) {
      const department = await this.departments.require(agent.owner_id, agent.department_id);
      if (department.manager_agent_id === null) {
        throw new BranchRuleError('Your department has no manager, so it has no branches.');
      }
      manager = await this.agents.require(agent.owner_id, department.manager_agent_id);
    }
    return { manager, manager_branch: manager_branch_name(manager.name) };
  }

  /** The branches an agent may publish to a repository: its open tasks' feature branches, or its manager branch. */
  async publishable(agent: AgentRecord, repository_id: string): Promise<string[]> {
    if (agent.level === 1) return [(await this.department_of(agent)).manager_branch];
    const open = await this.tasks.list_open_records(agent.owner_id);
    return open.flatMap((task) =>
      task.assignee_agent_id === agent.id &&
      task.repository_id === repository_id &&
      task.feature_branch !== null
        ? [task.feature_branch]
        : [],
    );
  }

  /**
   * The branch an agent works on: an intern's task feature branch, a manager's own branch, or for
   * a manager a feature branch of its department it wants to look at.
   *
   * @throws BranchRuleError when the task has no feature branch or the branch is not the agent's to take.
   */
  async working_branch(
    agent: AgentRecord,
    task: Pick<TaskRecord, 'feature_branch'> | null,
    requested: string | undefined,
  ): Promise<string> {
    const { manager, manager_branch } = await this.department_of(agent);
    if (agent.level !== 1) {
      if (requested !== undefined && requested !== task?.feature_branch) {
        throw new BranchRuleError('Interns work on the feature branch of their task only.');
      }
      if (task?.feature_branch === null || task?.feature_branch === undefined) {
        throw new BranchRuleError(
          'Your task has no feature branch. Only tasks on a repository have one.',
        );
      }
      return task.feature_branch;
    }
    if (requested === undefined || requested === manager_branch) return manager_branch;
    if (!is_department_feature_branch(requested, manager.name)) {
      throw new BranchRuleError(
        `${requested} is not a branch of your department. You work on ${manager_branch} and may check out your interns' ${manager_branch.replace(/main$/, '')}* branches.`,
      );
    }
    return requested;
  }
}
