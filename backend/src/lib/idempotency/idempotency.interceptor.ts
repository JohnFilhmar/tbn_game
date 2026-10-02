import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  UnprocessableEntityException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  IdempotencyKeySchema,
} from '@tbn/contracts';
import type { Response } from 'express';
import { catchError, mergeMap, of, type Observable } from 'rxjs';
import type { AuthenticatedRequest } from '@/lib/auth/authenticated_owner';
import { IS_PUBLIC_KEY } from '@/lib/auth/public.decorator';
import { error_message } from '@/utils/error_details';
import { CommandStore, type StoredAnswer } from './command_store';
import { request_hash } from './request_hash';

const COMMAND_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The first status of a client error and of a server error. */
const CLIENT_ERROR = 400;
const SERVER_ERROR = 500;

/** The answer Nest's exception filter sends for an error, or null for a 5xx or an unknown error. */
function client_error(error: unknown): StoredAnswer | null {
  if (!(error instanceof HttpException)) return null;
  const status = error.getStatus();
  if (status >= SERVER_ERROR) return null;
  const response = error.getResponse();
  return {
    status,
    body: typeof response === 'object' ? response : { statusCode: status, message: response },
  };
}

/**
 * Makes every authenticated command idempotent on its `Idempotency-Key`. The first request with a
 * key claims it and runs; a 2xx or 4xx answer is stored, and a 5xx releases the key so the client
 * can retry. A repeat of the same request gets the stored answer with `Idempotent-Replayed: true`,
 * a different request under the key gets 422, and a repeat while the first still runs gets 409.
 * Requests without the header, reads and `@Public()` routes pass through untouched.
 *
 * The claim and the command's own writes are separate transactions: a process that dies between
 * them leaves the key running, so the command runs at most once and the client reads what
 * happened from the event log.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly commands: CommandStore,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()];
    const owner = request.owner;
    if (
      header === undefined ||
      owner === undefined ||
      !COMMAND_METHODS.has(request.method) ||
      this.is_public(context)
    ) {
      return next.handle();
    }
    const key = IdempotencyKeySchema.safeParse(header);
    if (!key.success) {
      throw new BadRequestException(`${IDEMPOTENCY_KEY_HEADER} must be a single UUID`);
    }
    const response = context.switchToHttp().getResponse<Response>();
    const hash = request_hash(request.method, request.originalUrl, request.body);
    const start = await this.commands.begin(owner.id, key.data, hash);
    switch (start.state) {
      case 'different_request':
        throw new UnprocessableEntityException(
          `${IDEMPOTENCY_KEY_HEADER} ${key.data} was already used for a different request`,
        );
      case 'running':
        throw new ConflictException(
          `The request with ${IDEMPOTENCY_KEY_HEADER} ${key.data} is still running`,
        );
      case 'answered': {
        response.setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
        const { status, body } = start.answer;
        if (status >= CLIENT_ERROR) {
          throw new HttpException(
            typeof body === 'object' && body !== null ? body : String(body),
            status,
          );
        }
        return of(body);
      }
      case 'started':
        return next.handle().pipe(
          mergeMap(async (body: unknown) => {
            await this.settle(owner.id, key.data, { status: response.statusCode, body });
            return body;
          }),
          catchError(async (error: unknown) => {
            await this.settle_error(owner.id, key.data, error);
            throw error;
          }),
        );
    }
  }

  private is_public(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  /**
   * Stores a command's answer. When that fails the key stays running, which answers 409 rather
   * than run the command a second time.
   */
  private async settle(owner_id: string, key: string, answer: StoredAnswer): Promise<void> {
    try {
      await this.commands.finish(owner_id, key, answer);
    } catch (error: unknown) {
      this.logger.warn(`Answer of command ${key} not stored: ${error_message(error)}`);
    }
  }

  private async settle_error(owner_id: string, key: string, error: unknown): Promise<void> {
    const answer = client_error(error);
    try {
      if (answer === null) await this.commands.forget(owner_id, key);
      else await this.commands.finish(owner_id, key, answer);
    } catch (failure: unknown) {
      this.logger.warn(`Command ${key} not settled: ${error_message(failure)}`);
    }
  }
}
