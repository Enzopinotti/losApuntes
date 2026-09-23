import {
  Body,
  Controller,
  Delete,
  Get,
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
import { ProfileService } from './domain/profile.service';
import {
  CreateProfileActivityDto,
  CreateProfileDto,
  DeleteProfileActivityQueryDto,
  UpdateProfileActivityDto,
  UpdateProfileDto,
} from './dto/profile.dto';

@Controller()
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @UseGuards(AuthSessionGuard)
  @Get('profile/me')
  owner(@Req() request: AuthenticatedRequest) {
    return this.profile.getOwnerProfile(request.user.id);
  }

  @UseGuards(AuthSessionGuard)
  @Post('profile/me')
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateProfileDto) {
    return this.profile.createProfile(request.user.id, dto);
  }

  @UseGuards(AuthSessionGuard)
  @Patch('profile/me')
  update(@Req() request: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.profile.updateProfile(request.user.id, dto);
  }

  @UseGuards(AuthSessionGuard)
  @Post('profile/me/activities')
  createActivity(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateProfileActivityDto,
  ) {
    return this.profile.createActivity(request.user.id, dto);
  }

  @UseGuards(AuthSessionGuard)
  @Patch('profile/me/activities/:id')
  updateActivity(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProfileActivityDto,
  ) {
    return this.profile.updateActivity(request.user.id, id, dto);
  }

  @UseGuards(AuthSessionGuard)
  @Delete('profile/me/activities/:id')
  async deleteActivity(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: DeleteProfileActivityQueryDto,
  ): Promise<void> {
    await this.profile.deleteActivity(
      request.user.id,
      id,
      query.expectedRevision,
    );
  }

  @Get('profiles/:profileId')
  publicProfile(
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
  ) {
    return this.profile.getPublicProfile(profileId);
  }
}
