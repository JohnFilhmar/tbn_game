import { Controller, Get, Header, HttpStatus, Res } from '@nestjs/common';
import type { HealthResponse } from '@tbn/contracts';
import type { Response } from 'express';
import { HealthService } from './health.service';

/** `GET /health` on the web process. The worker serves the same body from its ops server. */
@Controller('health')
export class HealthController {
  constructor(private readonly health_service: HealthService) {}

  /** Answers 200 when every check passes and 503 otherwise, with the same body shape. */
  @Get()
  @Header('Cache-Control', 'no-store')
  async get_health(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const health = await this.health_service.check();
    response.status(health.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return health;
  }
}
