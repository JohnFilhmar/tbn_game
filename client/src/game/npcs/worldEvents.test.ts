import type { ChangeEvent, Task } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { agentChange, agentFixture, taskFixture } from '@/testing/fixtures';
import { worldEventsOf, worldEventsOfAll } from './worldEvents';

function taskChange(
  task: Task,
  op: ChangeEvent['op'],
  changed: string[] | null = null,
): ChangeEvent {
  return {
    seq: 1,
    entity: 'task',
    id: task.id,
    op,
    changed,
    data: op === 'delete' ? null : task,
    at: '2026-10-02T12:00:00.000Z',
  };
}

describe('deriving world events from changes', () => {
  it('starts, pauses and finishes a task for its assignee', () => {
    const task = taskFixture({ title: 'Notes' });
    expect(
      worldEventsOf(taskChange({ ...task, status: 'in_progress' }, 'update', ['status'])),
    ).toEqual([
      { kind: 'task_started', agentId: task.assignee_agent_id, taskId: task.id, title: 'Notes' },
    ]);
    expect(worldEventsOf(taskChange({ ...task, status: 'blocked' }, 'update', ['status']))).toEqual(
      [{ kind: 'task_waiting', agentId: task.assignee_agent_id, taskId: task.id, title: 'Notes' }],
    );
    expect(worldEventsOf(taskChange({ ...task, status: 'done' }, 'update', ['status']))).toEqual([
      {
        kind: 'task_finished',
        agentId: task.assignee_agent_id,
        taskId: task.id,
        title: 'Notes',
        status: 'done',
      },
    ]);
  });

  it('ignores a task update that did not change the status', () => {
    const task = taskFixture({ status: 'in_progress' });
    expect(worldEventsOf(taskChange(task, 'update', ['updated_at']))).toEqual([]);
    expect(worldEventsOf(taskChange(task, 'delete'))).toEqual([]);
  });

  it('hands off a delegated task and brings its result back', () => {
    const manager = agentFixture();
    const intern = agentFixture({ level: 2 });
    const part = taskFixture({
      title: 'Part one',
      assignee_agent_id: intern.id,
      delegator_agent_id: manager.id,
      parent_task_id: taskFixture().id,
    });
    expect(worldEventsOf(taskChange(part, 'insert'))).toEqual([
      {
        kind: 'handoff',
        fromAgentId: manager.id,
        toAgentId: intern.id,
        taskId: part.id,
        title: 'Part one',
      },
    ]);
    expect(worldEventsOf(taskChange({ ...part, status: 'done' }, 'update', ['status']))).toEqual([
      {
        kind: 'task_finished',
        agentId: intern.id,
        taskId: part.id,
        title: 'Part one',
        status: 'done',
      },
      {
        kind: 'result_returned',
        fromAgentId: intern.id,
        toAgentId: manager.id,
        taskId: part.id,
        title: 'Part one',
      },
    ]);
  });

  it('sees agents arrive, work, rest and leave', () => {
    const intern = agentFixture({ level: 2 });
    expect(worldEventsOf(agentChange(intern.id, 'insert', intern))).toEqual([
      { kind: 'agent_arrived', agentId: intern.id, level: 2 },
    ]);
    expect(
      worldEventsOf(
        agentChange(intern.id, 'update', { ...intern, status: 'working' }, 2, ['status']),
      ),
    ).toEqual([{ kind: 'agent_working', agentId: intern.id }]);
    expect(
      worldEventsOf(agentChange(intern.id, 'update', { ...intern, status: 'idle' }, 3, ['status'])),
    ).toEqual([{ kind: 'agent_idle', agentId: intern.id }]);
    expect(
      worldEventsOf(
        agentChange(intern.id, 'update', { ...intern, status: 'terminated' }, 4, ['status']),
      ),
    ).toEqual([{ kind: 'agent_left', agentId: intern.id }]);
    expect(
      worldEventsOf(agentChange(intern.id, 'update', { ...intern, name: 'Bo' }, 5, ['name'])),
    ).toEqual([]);
    expect(worldEventsOf(agentChange(intern.id, 'delete', null, 6))).toEqual([
      { kind: 'agent_left', agentId: intern.id },
    ]);
  });

  it('keeps the order of a batch and ignores other entities', () => {
    const intern = agentFixture({ level: 2 });
    const part = taskFixture({
      assignee_agent_id: intern.id,
      delegator_agent_id: agentFixture().id,
    });
    const events = worldEventsOfAll([
      agentChange(intern.id, 'insert', intern),
      taskChange(part, 'insert'),
      {
        seq: 3,
        entity: 'preferences',
        id: 'owner',
        op: 'update',
        changed: null,
        data: null,
        at: '2026-10-02T12:00:00.000Z',
      },
    ]);
    expect(events.map((event) => event.kind)).toEqual(['agent_arrived', 'handoff']);
  });
});
