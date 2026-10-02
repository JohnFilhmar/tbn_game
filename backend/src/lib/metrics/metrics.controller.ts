import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

/** `GET /metrics` on the web process, for Prometheus. */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics_service: MetricsService) {}

  /** Returns every metric in the Prometheus text exposition format. */
  @Get()
  @Header('Cache-Control', 'no-store')
  async get_metrics(@Res({ passthrough: true }) response: Response): Promise<string> {
    response.setHeader('Content-Type', this.metrics_service.content_type);
    return this.metrics_service.render();
  }
}
