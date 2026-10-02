import { Injectable, Logger } from '@nestjs/common';
import type { StreamChunk } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import { STREAM_CHANNEL, STREAM_TEXT_MAX_BYTES, type StreamNotice } from './channels';

/** How long text waits for more before it is published. */
const FLUSH_MS = 100;

/** Which model call a stream belongs to. */
export interface StreamTarget {
  owner_id: string;
  agent_id: string;
  run_id: string;
  /** The agent's last transcript entry when the call began. */
  after_seq: number;
}

/** Splits text into pieces of at most `max_bytes` UTF-8 bytes, never inside a character. */
export function split_utf8(text: string, max_bytes: number): string[] {
  const pieces: string[] = [];
  let current = '';
  let bytes = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > max_bytes && current.length > 0) {
      pieces.push(current);
      current = '';
      bytes = 0;
    }
    current += character;
    bytes += size;
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

/**
 * The output of one model call as it streams. Text is gathered for up to 100 ms or 1,000 bytes and
 * published in order; a new attempt of the call closes the last one; `close` publishes the rest
 * with `done`. Publishing is best effort: a failed notice is logged and never fails the call.
 */
export class ModelStream {
  private attempt = 1;
  private index = 0;
  private buffer = '';
  private timer: NodeJS.Timeout | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly target: StreamTarget,
    private readonly publish: (notice: StreamNotice) => Promise<void>,
  ) {}

  /** Adds text the model produced in attempt `attempt` of the call. */
  text(delta: string, attempt: number): void {
    if (attempt !== this.attempt) {
      this.flush(true);
      this.attempt = attempt;
      this.index = 0;
    }
    this.buffer += delta;
    if (Buffer.byteLength(this.buffer) >= STREAM_TEXT_MAX_BYTES) {
      this.flush(false);
      return;
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(false), FLUSH_MS);
      this.timer.unref();
    }
  }

  /** Publishes what is left, marked `done`, and waits until every chunk is out. */
  async close(): Promise<void> {
    this.flush(true);
    await this.chain;
  }

  private flush(done: boolean): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const pieces = split_utf8(this.buffer, STREAM_TEXT_MAX_BYTES);
    this.buffer = '';
    if (done && pieces.length === 0) pieces.push('');
    pieces.forEach((text, position) => {
      const chunk: StreamChunk = {
        agent_id: this.target.agent_id,
        run_id: this.target.run_id,
        after_seq: this.target.after_seq,
        attempt: this.attempt,
        index: this.index,
        text,
        done: done && position === pieces.length - 1,
      };
      this.index += 1;
      this.chain = this.chain.then(() => this.publish({ owner_id: this.target.owner_id, chunk }));
    });
  }
}

/**
 * Publishes model output on `STREAM_CHANNEL` for the web process to forward to the owner's
 * sockets. Nothing is stored, so a client that was away never sees it again; the finished reply
 * reaches it as a transcript entry in the event log.
 */
@Injectable()
export class StreamPublisherService {
  private readonly logger = new Logger(StreamPublisherService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Opens the stream of one model call. */
  open(target: StreamTarget): ModelStream {
    return new ModelStream(target, (notice) => this.notify(notice));
  }

  private async notify(notice: StreamNotice): Promise<void> {
    try {
      await this.prisma.$executeRaw`SELECT pg_notify(${STREAM_CHANNEL}, ${JSON.stringify(notice)})`;
    } catch (error: unknown) {
      this.logger.warn(
        `Stream chunk not published: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
