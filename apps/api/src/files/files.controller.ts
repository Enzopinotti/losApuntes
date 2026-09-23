import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { CreateFileUploadIntentDto } from './dto/file.dto';
import { FileService } from './domain/file.service';

@Controller('files')
@UseGuards(AuthSessionGuard, VerifiedEmailGuard)
export class FilesController {
  constructor(private readonly files: FileService) {}

  @Post('upload-intents')
  createUploadIntent(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateFileUploadIntentDto,
  ) {
    return this.files.createUploadIntent(request.user.id, dto);
  }

  @Post(':fileId/finalize')
  finalize(
    @Req() request: AuthenticatedRequest,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
  ) {
    return this.files.finalize(request.user.id, fileId);
  }
}
