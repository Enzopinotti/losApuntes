import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import {
  SocialConnection,
  SocialConnectionSchema,
  SocialFollow,
  SocialFollowSchema,
} from '../social/mongo/social.mongo-schemas';
import { SocialRelationshipController } from './social-relationship.controller';
import { SocialRelationshipService } from './social-relationship.service';

@Module({
  imports: [
    AuthModule,
    ProfileModule,
    MongooseModule.forFeature([
      { name: SocialFollow.name, schema: SocialFollowSchema },
      { name: SocialConnection.name, schema: SocialConnectionSchema },
    ]),
  ],
  providers: [SocialRelationshipService],
  controllers: [SocialRelationshipController],
})
export class SocialRelationshipModule {}
