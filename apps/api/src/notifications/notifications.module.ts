import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { UsersModule } from '../users/users.module';
import { NotificationService } from './domain/notification.service';
import { NOTIFICATION_STORE } from './domain/notification.store';
import {
  Notification,
  NotificationSchema,
} from './mongo/notification.mongo-schema';
import { MongoNotificationStore } from './mongo/mongo-notification.store';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    ProfileModule,
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  providers: [
    NotificationService,
    MongoNotificationStore,
    {
      provide: NOTIFICATION_STORE,
      useExisting: MongoNotificationStore,
    },
  ],
  controllers: [NotificationsController],
  exports: [NotificationService, MongooseModule],
})
export class NotificationsModule {}
