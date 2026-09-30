import { Module } from '@nestjs/common';

import { ReleaseController } from './release.controller';
import { ReleaseService } from './release.service';

@Module({
  controllers: [ReleaseController],
  providers: [ReleaseService],
  exports: [ReleaseService],
})
export class ReleaseModule {}
