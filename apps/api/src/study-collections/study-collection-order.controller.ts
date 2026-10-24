import {
  Body,
  Controller,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyCollectionOrderService } from './domain/study-collection-order.service';
import { ReorderStudyCollectionResourcesDto } from './dto/reorder-study-collection-resources.dto';
import { StudyCollectionsFeatureGuard } from './study-collections-feature.guard';

@Controller('study-collections')
@UseGuards(AuthSessionGuard, StudyCollectionsFeatureGuard)
export class StudyCollectionOrderController {
  constructor(private readonly order: StudyCollectionOrderService) {}

  @Patch(':id/resources/order')
  @Header('Cache-Control', 'private, no-store')
  reorder(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReorderStudyCollectionResourcesDto,
  ) {
    return this.order.reorder(request.user.id, id, dto);
  }
}
