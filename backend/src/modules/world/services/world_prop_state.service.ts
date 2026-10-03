import { Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import {
  MOST_WHITEBOARD_BYTES,
  WorldPropStateSchema,
  type EnvironmentName,
  type SaveWorldPropState,
  type WorldPropState,
} from '@tbn/contracts';
import {
  WORLD_PROP_STATE_REPOSITORY,
  type WorldPropStateRepository,
} from '@/modules/world/repositories/interface/world_prop_state_repository.interface';
import type { WorldPropStateRecord } from '@/modules/world/types/world_records';

function to_view(record: WorldPropStateRecord): WorldPropState {
  return WorldPropStateSchema.parse({ ...record, updated_at: record.updated_at.toISOString() });
}

/**
 * Each placed prop's own state: blinds, lamps and whiteboards. The server trusts the kind the
 * owner names, since the pack defaults it would check against live in the client; a state left
 * behind by a removed prop is harmless and stays.
 */
@Injectable()
export class WorldPropStateService {
  constructor(
    @Inject(WORLD_PROP_STATE_REPOSITORY) private readonly states: WorldPropStateRepository,
  ) {}

  /** Every saved prop state of an environment. */
  async list(owner_id: string, environment: EnvironmentName): Promise<WorldPropState[]> {
    return (await this.states.list(owner_id, environment)).map(to_view);
  }

  /**
   * A prop state by its id, as its events carry it.
   *
   * @throws NotFoundException when there is no such state.
   */
  async get_by_id(owner_id: string, id: string): Promise<WorldPropState> {
    const record = await this.states.find_by_id(owner_id, id);
    if (record === null) throw new NotFoundException('Prop state not found');
    return to_view(record);
  }

  /**
   * Saves a placed prop's whole state.
   *
   * @throws PayloadTooLargeException when a whiteboard's content is over its cap.
   */
  async save(
    owner_id: string,
    environment: EnvironmentName,
    placement_id: string,
    body: SaveWorldPropState,
  ): Promise<WorldPropState> {
    if (
      body.kind === 'whiteboard' &&
      Buffer.byteLength(JSON.stringify(body.state)) > MOST_WHITEBOARD_BYTES
    ) {
      throw new PayloadTooLargeException('The whiteboard is full: erase something first');
    }
    const saved = await this.states.save(owner_id, {
      environment,
      placement_id,
      kind: body.kind,
      state: body.state,
    });
    return to_view(saved);
  }
}
