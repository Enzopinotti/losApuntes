import {
  Controller,
  Get,
  Res,
} from '@nestjs/common';

import {
  HealthService,
  type ReadinessResult,
} from './health.service';

interface StatusReply {
  status(code: number): StatusReply;
}

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live() {
    return this.health.liveness();
  }

  @Get('ready')
  async ready(
    @Res({ passthrough: true }) reply: StatusReply,
  ): Promise<ReadinessResult> {
    const result = await this.health.readiness();

    if (result.status === 'not_ready') {
      reply.status(503);
    }

    return result;
  }
}
