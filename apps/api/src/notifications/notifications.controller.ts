import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { NotificationService } from './domain/notification.service';
import { NotificationListDto } from './dto/notification.dto';

@Controller('notifications')
@UseGuards(AuthSessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: NotificationListDto,
  ) {
    return this.notifications.list(request.user.id, query);
  }

  /**
   * Private badge counter: the client never needs notification contents or
   * another account's identity just to show unread status.
   */
  @Get('unread-count')
  @Header('Cache-Control', 'private, no-store')
  countUnread(@Req() request: AuthenticatedRequest) {
    return this.notifications.countUnread(request.user.id);
  }

  @Patch(':id/read')
  markRead(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.notifications.markRead(request.user.id, id);
  }

  @Post('read-all')
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notifications.markAllRead(request.user.id);
  }
}
