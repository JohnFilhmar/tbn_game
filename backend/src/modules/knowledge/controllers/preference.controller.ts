import { Controller, Get, Put } from '@nestjs/common';
import {
  PreferenceKeySchema,
  SetPreferenceSchema,
  type PreferenceKey,
  type Preferences,
  type SetPreference,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';

/** The owner's typed settings. */
@Controller('preferences')
export class PreferenceController {
  constructor(private readonly preference_service: PreferenceService) {}

  @Get()
  get(@CurrentOwner() owner: AuthenticatedOwner): Promise<Preferences> {
    return this.preference_service.get(owner.id);
  }

  @Put(':key')
  set(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('key', PreferenceKeySchema) key: PreferenceKey,
    @ZodBody(SetPreferenceSchema) body: SetPreference,
  ): Promise<Preferences> {
    return this.preference_service.set(owner.id, key, body.value);
  }
}
