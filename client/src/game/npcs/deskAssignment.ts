import type { Agent, Department } from '@tbn/contracts';
import type { Anchor, DeskAnchor, Zone } from '@/game/assets/packManifest';

/** Where an agent belongs in a pack: a desk in its department's zone, or an overflow anchor. */
export type Seat =
  { kind: 'desk'; zone: Zone; desk: DeskAnchor } | { kind: 'waiting'; anchor: Anchor };

/** What seating needs of an arranged pack: its zones and its overflow anchors. */
export interface SeatingPlan {
  zones: readonly Zone[];
  waiting: readonly Anchor[];
}

/** True for an agent that is still in the company. */
export function isLiveAgent(agent: Agent): boolean {
  return agent.status === 'idle' || agent.status === 'working';
}

function byCreation<T extends { created_at: string; id: string }>(left: T, right: T): number {
  return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
}

/**
 * Gives every live agent a seat. Departments take the zones in creation order; inside a zone the
 * manager has the first desk and the interns follow in creation order. An agent past the last desk
 * of its zone, or in a department past the last zone, stands at an overflow anchor, round robin.
 */
export function assignSeats(
  plan: SeatingPlan,
  departments: readonly Department[],
  agents: readonly Agent[],
): Map<string, Seat> {
  const seats = new Map<string, Seat>();
  const orderedDepartments = [...departments].sort(byCreation);
  const live = agents.filter(isLiveAgent);
  const overflow: Agent[] = [];
  const seen = new Set<string>();
  orderedDepartments.forEach((department, index) => {
    const zone = plan.zones[index];
    const members = live
      .filter((agent) => agent.department_id === department.id)
      .sort((left, right) => {
        const leftIsManager = left.id === department.manager_agent_id || left.level === 1;
        const rightIsManager = right.id === department.manager_agent_id || right.level === 1;
        if (leftIsManager !== rightIsManager) return leftIsManager ? -1 : 1;
        return byCreation(left, right);
      });
    members.forEach((agent, position) => {
      seen.add(agent.id);
      const desk = zone?.desks[position];
      if (zone !== undefined && desk !== undefined)
        seats.set(agent.id, { kind: 'desk', zone, desk });
      else overflow.push(agent);
    });
  });
  for (const agent of live.sort(byCreation)) {
    if (!seen.has(agent.id)) overflow.push(agent);
  }
  overflow.forEach((agent, index) => {
    const anchor = plan.waiting[index % plan.waiting.length];
    if (anchor !== undefined) seats.set(agent.id, { kind: 'waiting', anchor });
  });
  return seats;
}
