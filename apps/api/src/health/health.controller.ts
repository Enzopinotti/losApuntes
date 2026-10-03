import { Controller, Get, Res } from '@nestjs/common';

import { HealthService, type ReadinessResult } from './health.service';
import {
  ReleaseIdentityService,
  type ReleaseIdentityResult,
} from './release-identity.service';

interface StatusReply {
  status(code: number): StatusReply;
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly releaseIdentity: ReleaseIdentityService,
  ) {}

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

  @Get('release')
  release(
    @Res({ passthrough: true }) reply: StatusReply,
  ): ReleaseIdentityResult {
    const result = this.releaseIdentity.current();

    if (result.status === 'unavailable') {
      reply.status(503);
    }

    return result;
  }
}
