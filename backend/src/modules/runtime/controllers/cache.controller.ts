import { Controller, Get } from '@nestjs/common';
import type { CacheStats } from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { CacheStatsService } from '@/modules/runtime/services/web/cache_stats.service';

/** What the search and page caches saved. */
@Controller('caches')
export class CacheController {
  constructor(private readonly stats: CacheStatsService) {}

  @Get('stats')
  get_stats(@CurrentOwner() owner: AuthenticatedOwner): Promise<CacheStats> {
    return this.stats.stats(owner.id);
  }
}
