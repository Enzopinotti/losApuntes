import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  SocialConnection,
  SocialConnectionSchema,
  SocialFollow,
  SocialFollowSchema,
} from '../social/mongo/social.mongo-schemas';
import { NetworkOverviewController } from './network-overview.controller';
import { NetworkOverviewService } from './network-overview.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: SocialFollow.name, schema: SocialFollowSchema },
      { name: SocialConnection.name, schema: SocialConnectionSchema },
    ]),
  ],
  controllers: [NetworkOverviewController],
  providers: [NetworkOverviewService],
})
export class NetworkOverviewModule {}
