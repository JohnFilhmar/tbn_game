import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiFormat } from '@tbn/contracts';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '@/lib/database/prisma.service';
import type { ModelRequest } from '@/modules/runtime/types/model_request';
import { ProviderError } from '@/modules/runtime/types/provider_error';
import {
  start_fake_provider_server,
  type FakeProviderServer,
} from '@/testing/fake_provider_server';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { ProviderService } from './provider.service';
import {
  ProviderClientService,
  cost_of,
  retry_delay_ms,
  type ModelCallContext,
} from './provider_client.service';

const API_KEY = 'sk-test-ADAPTERCANARY';

const request_fixture: ModelRequest = {
  system: 'You are a writer.',
  tools: [
    {
      name: 'read_file',
      description: 'Read a file',
      input_schema: { type: 'object', properties: { path: { type: 'string' } } },
    },
    {
      name: 'finish_task',
      description: 'Finish',
      input_schema: { type: 'object', properties: {} },
    },
  ],
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'Write a haiku.' }] },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check notes.' },
        { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'notes.md' } },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'call_1', content: 'Notes here', is_error: false },
      ],
    },
  ],
};

const AnthropicWireSchema = z.looseObject({
  model: z.string(),
  max_tokens: z.number(),
  system: z.array(
    z.looseObject({
      type: z.literal('text'),
      text: z.string(),
      cache_control: z.looseObject({ type: z.literal('ephemeral') }),
    }),
  ),
  tools: z.array(z.looseObject({ name: z.string(), cache_control: z.unknown().optional() })),
  messages: z.array(
    z.looseObject({
      role: z.string(),
      content: z.array(z.looseObject({ type: z.string(), cache_control: z.unknown().optional() })),
    }),
  ),
});

const OpenAiWireSchema = z.looseObject({
  model: z.string(),
  max_tokens: z.number(),
  messages: z.array(
    z.looseObject({
      role: z.string(),
      content: z.unknown(),
      tool_calls: z.unknown().optional(),
      tool_call_id: z.string().optional(),
    }),
  ),
  tools: z.array(
    z.looseObject({
      type: z.literal('function'),
      function: z.looseObject({ name: z.string(), parameters: z.unknown() }),
    }),
  ),
});

describe('ProviderClientService', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let client: ProviderClientService;
  let providers: ProviderService;
  const servers: FakeProviderServer[] = [];

  async function connect(
    api_format: ApiFormat,
    max_parallel_requests: number | null = null,
  ): Promise<{ server: FakeProviderServer; context: ModelCallContext }> {
    const server = await start_fake_provider_server(api_format);
    servers.push(server);
    const provider = await providers.create(owner.owner_id, {
      name: `${api_format}-${servers.length}`,
      api_format,
      base_url: server.base_url,
      api_key: API_KEY,
      max_parallel_requests,
      models: [
        {
          model_id: 'test-model',
          cost_tier: 'standard',
          input_price_per_million: 1,
          output_price_per_million: 2,
          cache_read_price_per_million: 0.1,
          cache_write_price_per_million: 1.25,
          max_output_tokens: 777,
        },
      ],
    });
    const prisma = app.get(PrismaService);
    const department = await prisma.department.create({
      data: { owner_id: owner.owner_id, name: 'Client' },
    });
    const agent = await prisma.agent.create({
      data: {
        owner_id: owner.owner_id,
        name: `client_${randomBytes(4).toString('hex')}`,
        role: 'Client',
        job_description: 'x',
        level: 1,
        department_id: department.id,
        provider_id: provider.id,
        primary_model: 'test-model',
        intern_model: 'test-model',
      },
    });
    return {
      server,
      context: {
        owner_id: owner.owner_id,
        provider_id: provider.id,
        model_id: 'test-model',
        agent_id: agent.id,
        run_id: null,
      },
    };
  }

  beforeAll(async () => {
    const config = load_test_config();
    app = await create_test_web_app({
      ...config,
      providers: { ...config.providers, timeout_ms: 500, max_attempts: 2 },
    });
    owner = await create_test_owner(app);
    client = app.get(ProviderClientService);
    providers = app.get(ProviderService);
  });

  afterAll(async () => {
    await Promise.all(servers.map((server) => server.close()));
    await app.close();
  });

  it('maps the Anthropic Messages format both ways and caches the prefix', async () => {
    const { server, context } = await connect('anthropic_messages');
    server.enqueue({
      type: 'tool_use',
      name: 'finish_task',
      input: { outcome: 'done' },
      text: 'Finishing.',
    });

    const response = await client.complete(context, request_fixture);

    expect(response.stop_reason).toBe('tool_use');
    expect(response.content).toMatchObject([
      { type: 'text', text: 'Finishing.' },
      { type: 'tool_use', name: 'finish_task', input: { outcome: 'done' } },
    ]);
    const call = response.content[1];
    expect(call?.type === 'tool_use' ? call.id : '').toMatch(/^toolu_/);
    // Anthropic counts cache writes apart from input_tokens; the record counts every input token.
    expect(response.usage).toEqual({
      input_tokens: 220,
      output_tokens: 30,
      cache_read_tokens: 0,
      cache_write_tokens: 100,
    });

    const recorded = server.requests[0];
    expect(recorded?.path).toBe('/v1/messages');
    expect(recorded?.headers['x-api-key']).toBe(API_KEY);
    expect(recorded?.headers['anthropic-version']).toBe('2023-06-01');
    const wire = AnthropicWireSchema.parse(recorded?.body);
    expect(wire.model).toBe('test-model');
    expect(wire.max_tokens).toBe(777);
    expect(wire.system[0]?.text).toBe('You are a writer.');
    expect(wire.tools.map((tool) => tool.cache_control !== undefined)).toEqual([false, true]);
    expect(wire.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(wire.messages[2]?.content[0]?.type).toBe('tool_result');
    // Only the newest block carries a breakpoint, so the next turn reads the history from cache.
    const marks = wire.messages.flatMap((message) =>
      message.content.map((block) => block.cache_control !== undefined),
    );
    expect(marks.at(-1)).toBe(true);
    expect(marks.filter(Boolean)).toHaveLength(1);
  });

  it('maps the OpenAI chat completions format both ways', async () => {
    const { server, context } = await connect('openai_chat_completions');
    server.enqueue({ type: 'text', text: 'A haiku.' });

    const response = await client.complete(context, request_fixture);

    expect(response).toEqual({
      content: [{ type: 'text', text: 'A haiku.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 120, output_tokens: 30, cache_read_tokens: 0, cache_write_tokens: 0 },
    });
    const recorded = server.requests[0];
    expect(recorded?.path).toBe('/v1/chat/completions');
    expect(recorded?.headers['authorization']).toBe(`Bearer ${API_KEY}`);
    const wire = OpenAiWireSchema.parse(recorded?.body);
    expect(wire.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ]);
    expect(wire.messages[3]?.tool_call_id).toBe('call_1');
    expect(wire.tools.map((tool) => tool.function.name)).toEqual(['read_file', 'finish_task']);

    server.enqueue({ type: 'tool_use', name: 'read_file', input: { path: 'a.md' } });
    const second = await client.complete(context, request_fixture);
    expect(second.stop_reason).toBe('tool_use');
    expect(second.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'read_file',
      input: { path: 'a.md' },
    });
    expect(second.usage.cache_read_tokens).toBe(100);
  });

  it('records usage with cost per call', async () => {
    const { server, context } = await connect('anthropic_messages');
    server.enqueue({ type: 'text', text: 'one' });
    server.enqueue({ type: 'text', text: 'two' });
    await client.complete(context, request_fixture);
    await client.complete(context, request_fixture);

    const summary = await providers.usage_summary(owner.owner_id, context.provider_id);
    expect(summary).toMatchObject({
      requests: 2,
      input_tokens: 440,
      output_tokens: 60,
      cache_read_tokens: 100,
      cache_write_tokens: 100,
    });
    const first_cost = cost_of(
      { input_tokens: 220, output_tokens: 30, cache_read_tokens: 0, cache_write_tokens: 100 },
      {
        model_id: 'm',
        cost_tier: 'standard',
        input_price_per_million: 1,
        output_price_per_million: 2,
        cache_read_price_per_million: 0.1,
        cache_write_price_per_million: 1.25,
        max_output_tokens: 1,
        context_window_tokens: 128_000,
      },
    );
    expect(first_cost).toBeCloseTo((120 * 1 + 100 * 1.25 + 30 * 2) / 1_000_000, 12);
    expect(summary.cost).toBeGreaterThan(0);
  });

  it('retries a rate limit after the delay the provider asks for', async () => {
    const { server, context } = await connect('openai_chat_completions');
    server.enqueue({ type: 'status', status: 429, headers: { 'retry-after': '1' } });
    server.enqueue({ type: 'text', text: 'after retry' });

    const response = await client.complete(context, request_fixture);

    expect(response.content).toEqual([{ type: 'text', text: 'after retry' }]);
    expect(server.requests).toHaveLength(2);
    const gap = (server.requests[1]?.received_at ?? 0) - (server.requests[0]?.received_at ?? 0);
    expect(gap).toBeGreaterThanOrEqual(950);
  });

  it('does not retry an authentication error or an out of credit answer', async () => {
    const { server, context } = await connect('anthropic_messages');
    server.enqueue({ type: 'status', status: 401 });
    await expect(client.complete(context, request_fixture)).rejects.toMatchObject({
      kind: 'authentication',
      retryable: false,
    });
    expect(server.requests).toHaveLength(1);

    server.enqueue({
      type: 'status',
      status: 400,
      body: {
        error: {
          type: 'invalid_request_error',
          message: 'Your credit balance is too low to access the Anthropic API.',
        },
      },
    });
    await expect(client.complete(context, request_fixture)).rejects.toMatchObject({
      kind: 'out_of_credit',
    });
    const marked = await providers.require(owner.owner_id, context.provider_id);
    expect(marked.out_of_credit_since).not.toBeNull();
    expect(marked.breaker_failures).toBe(0);

    const { server: openai, context: openai_context } = await connect('openai_chat_completions');
    openai.enqueue({
      type: 'status',
      status: 429,
      body: { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } },
    });
    await expect(client.complete(openai_context, request_fixture)).rejects.toMatchObject({
      kind: 'out_of_credit',
    });
    expect(openai.requests).toHaveLength(1);
  });

  it('gives up after the configured attempts and classifies timeouts', async () => {
    const { server, context } = await connect('openai_chat_completions');
    server.enqueue({ type: 'status', status: 503 });
    server.enqueue({ type: 'status', status: 503 });
    await expect(client.complete(context, request_fixture)).rejects.toMatchObject({
      kind: 'server',
      status: 503,
    });
    expect(server.requests).toHaveLength(2);

    server.enqueue({ type: 'hold' });
    server.enqueue({ type: 'hold' });
    const failure = client.complete(context, request_fixture);
    await expect(failure).rejects.toBeInstanceOf(ProviderError);
    await expect(failure).rejects.toMatchObject({ kind: 'timeout' });
    server.release();
  });

  it('counts calls that fail after their retries towards the breaker, and a success closes it', async () => {
    const { server, context } = await connect('openai_chat_completions');
    const state = async (): Promise<{ failures: number; open: boolean }> => {
      const record = await providers.require(owner.owner_id, context.provider_id);
      return { failures: record.breaker_failures, open: record.breaker_open_until !== null };
    };
    const fail_once = async (): Promise<void> => {
      server.enqueue({ type: 'status', status: 503 });
      server.enqueue({ type: 'status', status: 503 });
      await expect(client.complete(context, request_fixture)).rejects.toMatchObject({
        kind: 'server',
      });
    };

    await fail_once();
    expect(await state()).toEqual({ failures: 1, open: false });
    server.enqueue({ type: 'status', status: 401 });
    await expect(client.complete(context, request_fixture)).rejects.toMatchObject({
      kind: 'authentication',
    });
    expect(await state()).toEqual({ failures: 1, open: false });

    await fail_once();
    await fail_once();
    expect(await state()).toEqual({ failures: 3, open: true });

    server.enqueue({ type: 'text', text: 'back' });
    await client.complete(context, request_fixture);
    expect(await state()).toEqual({ failures: 0, open: false });
  });

  it('holds a provider to its parallel request limit', async () => {
    const { server, context } = await connect('openai_chat_completions', 1);
    for (let index = 0; index < 3; index += 1) {
      server.enqueue({ type: 'text', text: `reply ${index}`, delay_ms: 150 });
    }
    const replies = await Promise.all(
      [0, 1, 2].map(() => client.complete(context, request_fixture)),
    );
    expect(replies).toHaveLength(3);
    expect(server.requests).toHaveLength(3);
    expect(server.max_in_flight).toBe(1);

    const { server: open, context: open_context } = await connect('openai_chat_completions');
    for (let index = 0; index < 3; index += 1) {
      open.enqueue({ type: 'text', text: `reply ${index}`, delay_ms: 150 });
    }
    await Promise.all([0, 1, 2].map(() => client.complete(open_context, request_fixture)));
    expect(open.max_in_flight).toBe(3);
  });

  it('computes backoff with jitter under the ceiling', () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const delay = retry_delay_ms(attempt, undefined);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(Math.min(60_000, 1_000 * 2 ** attempt));
    }
    expect(retry_delay_ms(0, 2_500)).toBe(2_500);
    expect(retry_delay_ms(0, 120_000)).toBe(60_000);
  });
  describe('streaming', () => {
    const StreamFlagSchema = z.looseObject({
      stream: z.literal(true),
      stream_options: z.looseObject({ include_usage: z.literal(true) }).optional(),
    });

    function collector(): {
      pieces: Array<[string, number]>;
      on_text: (text: string, attempt: number) => void;
    } {
      const pieces: Array<[string, number]> = [];
      return { pieces, on_text: (text, attempt) => pieces.push([text, attempt]) };
    }

    it.each(['anthropic_messages', 'openai_chat_completions'] as const)(
      'streams %s text as it arrives and assembles the same answer',
      async (api_format) => {
        const { server, context } = await connect(api_format);
        server.enqueue({
          type: 'tool_use',
          name: 'read_file',
          input: { path: 'notes/a long path.md', lines: [1, 2] },
          text: 'Let me read the notes first.',
        });
        const { pieces, on_text } = collector();

        const response = await client.complete(context, request_fixture, { on_text });

        expect(pieces.length).toBeGreaterThan(1);
        expect(pieces.map(([text]) => text).join('')).toBe('Let me read the notes first.');
        expect(pieces.every(([, attempt]) => attempt === 1)).toBe(true);
        expect(response.stop_reason).toBe('tool_use');
        expect(response.content).toMatchObject([
          { type: 'text', text: 'Let me read the notes first.' },
          {
            type: 'tool_use',
            name: 'read_file',
            input: { path: 'notes/a long path.md', lines: [1, 2] },
          },
        ]);
        // Anthropic's cache write of 100 counts as input; OpenAI's prompt tokens already include it.
        expect(response.usage.input_tokens).toBe(api_format === 'anthropic_messages' ? 220 : 120);
        expect(response.usage.output_tokens).toBe(30);
        const flags = StreamFlagSchema.parse(server.requests[0]?.body);
        expect(flags.stream_options !== undefined).toBe(api_format === 'openai_chat_completions');
      },
    );

    it.each(['anthropic_messages', 'openai_chat_completions'] as const)(
      'retries a %s stream that fails midway, as a new attempt',
      async (api_format) => {
        const { server, context } = await connect(api_format);
        server.enqueue({ type: 'stream_error', text: 'Half an answer and then' });
        server.enqueue({ type: 'text', text: 'A whole answer.' });
        const { pieces, on_text } = collector();

        const response = await client.complete(context, request_fixture, { on_text });

        expect(response.content).toEqual([{ type: 'text', text: 'A whole answer.' }]);
        expect(pieces.filter(([, attempt]) => attempt === 1).length).toBeGreaterThan(0);
        expect(
          pieces
            .filter(([, attempt]) => attempt === 2)
            .map(([text]) => text)
            .join(''),
        ).toBe('A whole answer.');
        expect(server.requests).toHaveLength(2);
      },
    );

    it('records zero tokens when an OpenAI-compatible server sends no usage', async () => {
      const { server, context } = await connect('openai_chat_completions');
      server.enqueue({ type: 'text', text: 'No usage here.', stream_usage: false });

      const response = await client.complete(context, request_fixture, collector());

      expect(response).toEqual({
        content: [{ type: 'text', text: 'No usage here.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 },
      });
    });

    it('classifies an error status the same way with or without a stream', async () => {
      const { server, context } = await connect('anthropic_messages');
      server.enqueue({ type: 'status', status: 401, body: { error: { message: 'bad key' } } });

      await expect(client.complete(context, request_fixture, collector())).rejects.toMatchObject({
        kind: 'authentication',
      });
    });
  });
});
