import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { NotificationCategoryService } from './domain/notification-category.service';
import { NotificationCategoryPageDto } from './dto/notification-category.dto';

@Controller('notifications/categories')
@UseGuards(AuthSessionGuard)
export class NotificationCategoryController {
  constructor(private readonly categories: NotificationCategoryService) {}

  @Get('unread-counts')
  @Header('Cache-Control', 'private, no-store')
  unreadCounts(@Req() request: AuthenticatedRequest) {
    return this.categories.unreadCounts(request.user.id);
  }

  @Get(':category')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('category') category: string,
    @Query() query: NotificationCategoryPageDto,
  ) {
    return this.categories.list(request.user.id, category, query);
  }
}
