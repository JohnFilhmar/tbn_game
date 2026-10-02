import { Logger } from '@nestjs/common';
import type { ChangeEvent } from '@tbn/contracts';
import type { EventBatch } from './event_feed.service';

/** How many events one `changes` message carries at most. */
export const DELIVERY_BATCH = 200;

/** What a socket feed needs from its socket and from the log. */
export interface SocketFeedPorts {
  read(owner_id: string, after: number, limit: number): Promise<EventBatch>;
  send(events: ChangeEvent[]): void;
  connected(): boolean;
}

/**
 * The delivery loop of one socket. It sends the owner's events in order from its cursor, one batch
 * at a time; a wake while it sends marks it dirty and it reads again, so it never repeats or skips
 * a sequence however notifications and reconnects interleave.
 */
export class SocketFeed {
  private readonly logger = new Logger(SocketFeed.name);
  private sending = false;
  private dirty = false;

  constructor(
    readonly owner_id: string,
    private cursor: number,
    private readonly ports: SocketFeedPorts,
  ) {}

  /** The last sequence sent. */
  get last_sent(): number {
    return this.cursor;
  }

  /** Sends whatever the log holds after the cursor. Safe to call at any time. */
  async wake(): Promise<void> {
    if (this.sending) {
      this.dirty = true;
      return;
    }
    this.sending = true;
    try {
      do {
        this.dirty = false;
        for (;;) {
          if (!this.ports.connected()) return;
          const batch = await this.ports.read(this.owner_id, this.cursor, DELIVERY_BATCH);
          if (batch.events.length > 0 && this.ports.connected()) this.ports.send(batch.events);
          if (batch.last_seq === this.cursor) break;
          this.cursor = batch.last_seq;
        }
      } while (this.dirty);
    } catch (error: unknown) {
      this.logger.warn(
        `Delivery to a socket of ${this.owner_id} stopped: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.sending = false;
    }
  }
}
