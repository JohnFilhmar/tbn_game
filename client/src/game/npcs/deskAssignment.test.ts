import type { Department } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { PACKS } from '@/game/assets/packs';
import { arrangePack } from '@/game/props/arrangedPack';
import { agentFixture, fixtureId } from '@/testing/fixtures';
import { assignSeats, isLiveAgent } from './deskAssignment';

function department(
  name: string,
  createdAt: string,
  managerAgentId: string | null = null,
): Department {
  return {
    id: fixtureId(),
    name,
    manager_agent_id: managerAgentId,
    member_count: 0,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

const office = arrangePack(PACKS.office, null);
const manifest = { zones: office.zones, waiting: office.manifest.waiting };

describe('assigning seats', () => {
  it('gives departments the zones in creation order and the manager the first desk', () => {
    const research = department('Research', '2026-01-02T00:00:00.000Z');
    const sales = department('Sales', '2026-01-01T00:00:00.000Z');
    const manager = agentFixture({
      department_id: research.id,
      created_at: '2026-01-05T00:00:00.000Z',
    });
    const intern = agentFixture({
      department_id: research.id,
      level: 2,
      created_at: '2026-01-03T00:00:00.000Z',
    });
    research.manager_agent_id = manager.id;
    const seller = agentFixture({ department_id: sales.id });
    const seats = assignSeats(manifest, [research, sales], [intern, manager, seller]);
    const zoneOf = (id: string) => {
      const seat = seats.get(id);
      return seat?.kind === 'desk' ? seat.zone.name : seat?.kind;
    };
    expect(zoneOf(seller.id)).toBe('zone_1');
    expect(zoneOf(manager.id)).toBe('zone_2');
    expect(zoneOf(intern.id)).toBe('zone_2');
    const managerSeat = seats.get(manager.id);
    const internSeat = seats.get(intern.id);
    expect(managerSeat?.kind === 'desk' && managerSeat.desk).toEqual(manifest.zones[1]?.desks[0]);
    expect(internSeat?.kind === 'desk' && internSeat.desk).toEqual(manifest.zones[1]?.desks[1]);
  });

  it('sends agents past the desks and departments past the zones to the waiting anchors', () => {
    const departments = Array.from({ length: 5 }, (_, index) =>
      department(`D${index}`, `2026-01-0${index + 1}T00:00:00.000Z`),
    );
    const first = departments[0];
    const last = departments[4];
    if (first === undefined || last === undefined) throw new Error('five departments');
    const crowd = Array.from({ length: 5 }, (_, index) =>
      agentFixture({
        department_id: first.id,
        level: index === 0 ? 1 : 2,
        created_at: `2026-02-0${index + 1}T00:00:00.000Z`,
      }),
    );
    const late = agentFixture({ department_id: last.id });
    const seats = assignSeats(manifest, departments, [...crowd, late]);
    expect(crowd.slice(0, 4).map((agent) => seats.get(agent.id)?.kind)).toEqual([
      'desk',
      'desk',
      'desk',
      'desk',
    ]);
    expect(seats.get(crowd[4]?.id ?? '')?.kind).toBe('waiting');
    expect(seats.get(late.id)?.kind).toBe('waiting');
    const anchors = [crowd[4], late].map((agent) => {
      const seat = seats.get(agent?.id ?? '');
      return seat?.kind === 'waiting' ? seat.anchor : undefined;
    });
    expect(anchors[0]).not.toEqual(anchors[1]);
  });

  it('seats only live agents', () => {
    const team = department('Team', '2026-01-01T00:00:00.000Z');
    const gone = agentFixture({ department_id: team.id, status: 'terminated' });
    const dismissed = agentFixture({ department_id: team.id, status: 'dismissed' });
    const here = agentFixture({ department_id: team.id, status: 'working' });
    expect([gone, dismissed, here].map(isLiveAgent)).toEqual([false, false, true]);
    const seats = assignSeats(manifest, [team], [gone, dismissed, here]);
    expect([...seats.keys()]).toEqual([here.id]);
  });
});
