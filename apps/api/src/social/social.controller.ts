import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { SocialService } from './domain/social.service';
import { ConnectionRequestsDto } from './dto/connection-requests.dto';
import { ConnectionListDto, SocialListDto } from './dto/social.dto';

@Controller('social')
@UseGuards(AuthSessionGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('me/following')
  following(
    @Req() request: AuthenticatedRequest,
    @Query() query: SocialListDto,
  ) {
    return this.social.listFollowing(
      request.user.id,
      query.limit,
      query.cursor,
    );
  }

  @Get('me/connection-requests')
  @Header('Cache-Control', 'private, no-store')
  connectionRequests(
    @Req() request: AuthenticatedRequest,
    @Query() query: ConnectionRequestsDto,
  ) {
    return this.social.listConnectionRequests(
      request.user.id,
      query.direction,
      query.limit,
      query.cursor,
    );
  }

  @Get('me/connection-requests/incoming-count')
  @Header('Cache-Control', 'private, no-store')
  incomingRequestCount(@Req() request: AuthenticatedRequest) {
    return this.social.countIncomingConnectionRequests(request.user.id);
  }

  @Get('me/connections')
  connections(
    @Req() request: AuthenticatedRequest,
    @Query() query: ConnectionListDto,
  ) {
    return this.social.listConnections(
      request.user.id,
      query.status,
      query.limit,
      query.cursor,
    );
  }

  @UseGuards(VerifiedEmailGuard)
  @Put('profiles/:profileId/follow')
  follow(
    @Req() request: AuthenticatedRequest,
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
  ) {
    return this.social.follow(request.user.id, profileId);
  }

  @UseGuards(VerifiedEmailGuard)
  @Delete('profiles/:profileId/follow')
  async unfollow(
    @Req() request: AuthenticatedRequest,
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
  ): Promise<void> {
    await this.social.unfollow(request.user.id, profileId);
  }

  @UseGuards(VerifiedEmailGuard)
  @Post('profiles/:profileId/connections')
  requestConnection(
    @Req() request: AuthenticatedRequest,
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
  ) {
    return this.social.requestConnection(request.user.id, profileId);
  }

  @UseGuards(VerifiedEmailGuard)
  @Post('connections/:id/accept')
  accept(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.social.respond(request.user.id, id, 'accepted');
  }

  @UseGuards(VerifiedEmailGuard)
  @Post('connections/:id/decline')
  decline(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.social.respond(request.user.id, id, 'declined');
  }

  @UseGuards(VerifiedEmailGuard)
  @Delete('connections/:id')
  async disconnect(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.social.disconnect(request.user.id, id);
  }
}
