import type { AgentLevel, ChangeEvent, TaskStatus } from '@tbn/contracts';

/**
 * What the world shows of a change: the entity events the client already applies to its cache,
 * read as things that happen to agents. The server never knows a position; everything an agent
 * does in the world starts here.
 */
export type WorldEvent =
  | { kind: 'task_started'; agentId: string; taskId: string; title: string }
  | { kind: 'task_waiting'; agentId: string; taskId: string; title: string }
  | { kind: 'task_finished'; agentId: string; taskId: string; title: string; status: TaskStatus }
  | { kind: 'handoff'; fromAgentId: string; toAgentId: string; taskId: string; title: string }
  | {
      kind: 'result_returned';
      fromAgentId: string;
      toAgentId: string;
      taskId: string;
      title: string;
    }
  | { kind: 'agent_arrived'; agentId: string; level: AgentLevel }
  | { kind: 'agent_working'; agentId: string }
  | { kind: 'agent_idle'; agentId: string }
  | { kind: 'agent_left'; agentId: string };

const FINISHED: readonly TaskStatus[] = ['done', 'failed', 'cancelled', 'declined'];
const WAITING: readonly TaskStatus[] = ['blocked', 'awaiting_approval'];

/** The world events one change stands for, in the order they happen. */
export function worldEventsOf(event: ChangeEvent): WorldEvent[] {
  if (event.entity === 'task') {
    const task = event.data;
    if (task === null) return [];
    const base = { taskId: task.id, title: task.title };
    if (event.op === 'insert') {
      const events: WorldEvent[] = [];
      if (task.delegator_agent_id !== null) {
        events.push({
          kind: 'handoff',
          fromAgentId: task.delegator_agent_id,
          toAgentId: task.assignee_agent_id,
          ...base,
        });
      }
      if (task.status === 'in_progress') {
        events.push({ kind: 'task_started', agentId: task.assignee_agent_id, ...base });
      }
      return events;
    }
    if (event.op !== 'update' || !(event.changed?.includes('status') ?? true)) return [];
    if (task.status === 'in_progress') {
      return [{ kind: 'task_started', agentId: task.assignee_agent_id, ...base }];
    }
    if (WAITING.includes(task.status)) {
      return [{ kind: 'task_waiting', agentId: task.assignee_agent_id, ...base }];
    }
    if (FINISHED.includes(task.status)) {
      const events: WorldEvent[] = [
        { kind: 'task_finished', agentId: task.assignee_agent_id, status: task.status, ...base },
      ];
      if (task.parent_task_id !== null && task.delegator_agent_id !== null) {
        events.push({
          kind: 'result_returned',
          fromAgentId: task.assignee_agent_id,
          toAgentId: task.delegator_agent_id,
          ...base,
        });
      }
      return events;
    }
    return [];
  }
  if (event.entity === 'agent') {
    if (event.op === 'delete' || event.data === null) {
      return [{ kind: 'agent_left', agentId: event.id }];
    }
    const agent = event.data;
    if (event.op === 'insert')
      return [{ kind: 'agent_arrived', agentId: agent.id, level: agent.level }];
    if (!(event.changed?.includes('status') ?? true)) return [];
    if (agent.status === 'terminated' || agent.status === 'dismissed') {
      return [{ kind: 'agent_left', agentId: agent.id }];
    }
    return [
      { kind: agent.status === 'working' ? 'agent_working' : 'agent_idle', agentId: agent.id },
    ];
  }
  return [];
}

/** The world events of a batch of changes, in order. */
export function worldEventsOfAll(events: readonly ChangeEvent[]): WorldEvent[] {
  return events.flatMap(worldEventsOf);
}
