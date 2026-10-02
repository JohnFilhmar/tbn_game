import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RunSourceService } from '@/modules/runtime/services/taint/run_source.service';
import { LibraryService } from '@/modules/runtime/services/web/library.service';
import type { Tool, ToolContext, ToolOutcome } from './tool.interface';

const InputSchema = z.strictObject({
  query: z.string().trim().min(1).max(500).describe('Words to look for, web search style'),
});

type Input = z.infer<typeof InputSchema>;

/** Searches what the company has already read and written. */
@Injectable()
export class SearchLibraryTool implements Tool<Input> {
  readonly name = 'search_library';
  readonly description =
    'Search the research library: every web page the company has read and every report it has written. Use it before web_search. Read a page hit with fetch_url, which answers from the cache.';
  readonly default_policy = 'auto';
  readonly input_schema = InputSchema;

  constructor(
    private readonly library: LibraryService,
    private readonly sources: RunSourceService,
  ) {}

  async execute(input: Input, context: ToolContext): Promise<ToolOutcome> {
    const hits = await this.library.search(context.owner_id, input.query);
    if (hits.length === 0) return { content: `The library has nothing on "${input.query}".` };
    await this.sources.record(context.owner_id, context.run_id, 'library', input.query, true);
    const lines = hits.map((hit) =>
      hit.kind === 'page'
        ? `- [page] ${hit.title}\n  ${hit.reference}\n  ${hit.excerpt}`
        : `- [report] ${hit.title} (report ${hit.reference})\n  ${hit.excerpt}`,
    );
    return { content: lines.join('\n') };
  }
}
