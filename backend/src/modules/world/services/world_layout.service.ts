import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ENVIRONMENT_BOUNDS,
  WorldLayoutSchema,
  type EnvironmentName,
  type SaveWorldLayout,
  type WorldLayout,
  type WorldPlacement,
} from '@tbn/contracts';
import {
  WORLD_LAYOUT_REPOSITORY,
  type WorldLayoutRepository,
} from '@/modules/world/repositories/interface/world_layout_repository.interface';
import type { WorldLayoutRecord } from '@/modules/world/types/world_records';

function to_view(record: WorldLayoutRecord): WorldLayout {
  return WorldLayoutSchema.parse({
    id: record.id,
    environment: record.environment,
    theme: record.theme,
    placements: record.placements,
    revision: record.revision,
    updated_at: record.updated_at.toISOString(),
  });
}

/** Why a layout cannot be saved, or null when it can. */
function problem_with(environment: EnvironmentName, placements: WorldPlacement[]): string | null {
  const bounds = ENVIRONMENT_BOUNDS[environment];
  const ids = new Set<string>();
  let computers = 0;
  for (const placement of placements) {
    if (ids.has(placement.id)) return `placement ${placement.id} appears twice`;
    ids.add(placement.id);
    if (placement.kind === 'computer_desk') computers += 1;
    const is_inside =
      placement.x >= bounds.min_x &&
      placement.x <= bounds.max_x &&
      placement.z >= bounds.min_z &&
      placement.z <= bounds.max_z;
    if (!is_inside) return `${placement.kind} ${placement.id} is off the floor`;
  }
  return computers === 1 ? null : 'a layout needs exactly one computer desk';
}

/**
 * Each environment as the owner arranged it: a theme and every placed prop, kept whole per owner
 * and environment. Saving checks what the server can check alone (the floor's bounds, one
 * computer, unique ids); overlaps and reachability need the pack's walls and stay with the client.
 */
@Injectable()
export class WorldLayoutService {
  constructor(@Inject(WORLD_LAYOUT_REPOSITORY) private readonly layouts: WorldLayoutRepository) {}

  /** The saved layout of an environment, or null when the pack default applies. */
  async get(owner_id: string, environment: EnvironmentName): Promise<WorldLayout | null> {
    const record = await this.layouts.find(owner_id, environment);
    return record === null ? null : to_view(record);
  }

  /**
   * A saved layout by its id, as its events carry it.
   *
   * @throws NotFoundException when there is no such layout.
   */
  async get_by_id(owner_id: string, id: string): Promise<WorldLayout> {
    const record = await this.layouts.find_by_id(owner_id, id);
    if (record === null) throw new NotFoundException('Layout not found');
    return to_view(record);
  }

  /**
   * Saves a whole layout over the revision the owner started from.
   *
   * @throws BadRequestException when a prop is off the floor, an id repeats, or there is not
   *   exactly one computer desk.
   * @throws ConflictException when the layout was saved since that revision.
   */
  async save(
    owner_id: string,
    environment: EnvironmentName,
    body: SaveWorldLayout,
  ): Promise<WorldLayout> {
    const problem = problem_with(environment, body.placements);
    if (problem !== null) throw new BadRequestException(problem);
    const theme = Object.fromEntries(
      Object.entries(body.theme).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    const saved = await this.layouts.save(owner_id, environment, body.revision, {
      theme,
      placements: body.placements,
    });
    if (saved === null) {
      throw new ConflictException('The layout was saved elsewhere since you loaded it');
    }
    return to_view(saved);
  }

  /** Forgets the saved layout, so the pack default applies again. */
  async reset(owner_id: string, environment: EnvironmentName): Promise<void> {
    await this.layouts.remove(owner_id, environment);
  }
}
