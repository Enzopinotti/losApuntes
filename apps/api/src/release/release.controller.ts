import { Controller, Get } from '@nestjs/common';

import { ReleaseService, type ApiReleaseMetadata } from './release.service';

@Controller('release')
export class ReleaseController {
  constructor(private readonly release: ReleaseService) {}

  @Get()
  get(): ApiReleaseMetadata {
    return this.release.metadata();
  }
}
