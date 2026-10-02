import { Writable } from 'node:stream';

/** Collects every log line written during a test. */
export class LogCapture extends Writable {
  private readonly chunks: string[] = [];

  override _write(chunk: Buffer | string, _encoding: string, callback: () => void): void {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    callback();
  }

  /** Everything written so far. */
  get text(): string {
    return this.chunks.join('');
  }
}
