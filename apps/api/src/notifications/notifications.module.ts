import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { UsersModule } from '../users/users.module';
import { NotificationCategoryService } from './domain/notification-category.service';
import { NotificationService } from './domain/notification.service';
import { NOTIFICATION_STORE } from './domain/notification.store';
import {
  Notification,
  NotificationSchema,
} from './mongo/notification.mongo-schema';
import { MongoNotificationStore } from './mongo/mongo-notification.store';
import { NotificationCategoryController } from './notification-category.controller';
import { NotificationsController } from './notifications.controller';

// Index before model registration: category inboxes must filter owner and type
// before sorting or paging. No existing notification collection fields change.
NotificationSchema.index({ userId: 1, type: 1, createdAt: -1, id: 1 });
NotificationSchema.index({
  userId: 1,
  type: 1,
  readAt: 1,
  createdAt: -1,
  id: 1,
});

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
    NotificationCategoryService,
    MongoNotificationStore,
    {
      provide: NOTIFICATION_STORE,
      useExisting: MongoNotificationStore,
    },
  ],
  controllers: [NotificationsController, NotificationCategoryController],
  exports: [NotificationService, MongooseModule],
})
export class NotificationsModule {}
