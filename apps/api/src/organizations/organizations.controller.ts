import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { OptionalAuthSessionGuard } from '../auth/guards/optional-auth-session.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import {
  ChangeOrganizationManagerDto,
  CreateOrganizationDto,
  CreateOrganizationEventDto,
  CreateOrganizationLinkDto,
  CreateOrganizationPostDto,
  OrganizationEventListDto,
  OrganizationPostListDto,
  OrganizationSearchDto,
  RemoveOrganizationManagerDto,
  UpdateOrganizationDto,
  UpdateOrganizationEventDto,
  UpdateOrganizationPostDto,
  UpdateOrganizationVerificationDto,
} from './dto/organization.dto';
import { OrganizationService } from './domain/organization.service';
import { OrganizationsVerifyGuard } from './guards/organizations-verify.guard';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationService) {}

  @UseGuards(OptionalAuthSessionGuard)
  @Get()
  search(
    @Req() request: OptionallyAuthenticatedRequest,
    @Query() query: OrganizationSearchDto,
  ) {
    return this.organizations.search(request.user?.id, query);
  }

  @UseGuards(AuthSessionGuard)
  @Get(':id/manage')
  management(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.organizations.managementSnapshot(request.user.id, id);
  }

  @Get(':id/posts')
  posts(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: OrganizationPostListDto,
  ) {
    return this.organizations.listPosts(id, query.limit, query.before);
  }

  @Get(':id/events')
  events(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: OrganizationEventListDto,
  ) {
    return this.organizations.listEvents(id, query.limit, query.from);
  }

  @UseGuards(OptionalAuthSessionGuard)
  @Get(':id')
  get(
    @Req() request: OptionallyAuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.organizations.get(id, request.user?.id);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizations.create(request.user.id, dto);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizations.update(request.user.id, id, dto);
  }

  @UseGuards(
    AuthSessionGuard,
    VerifiedEmailGuard,
    OrganizationsVerifyGuard,
  )
  @Patch(':id/verification')
  verification(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateOrganizationVerificationDto,
  ) {
    return this.organizations.updateVerification(request.user.id, id, dto);
  }

  @UseGuards(AuthSessionGuard)
  @Put(':id/follow')
  follow(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.organizations.follow(request.user.id, id);
  }

  @UseGuards(AuthSessionGuard)
  @Delete(':id/follow')
  unfollow(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.organizations.unfollow(request.user.id, id);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Put(':id/managers/:profileId')
  manager(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('profileId', new ParseUUIDPipe({ version: '4' }))
    profileId: string,
    @Body() dto: ChangeOrganizationManagerDto,
  ) {
    return this.organizations.changeManager(
      request.user.id,
      id,
      profileId,
      dto,
    );
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Delete(':id/managers/:profileId')
  removeManager(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('profileId', new ParseUUIDPipe({ version: '4' }))
    profileId: string,
    @Body() dto: RemoveOrganizationManagerDto,
  ) {
    return this.organizations.removeManager(
      request.user.id,
      id,
      profileId,
      dto,
    );
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Post(':id/posts')
  createPost(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateOrganizationPostDto,
  ) {
    return this.organizations.createPost(request.user.id, id, dto);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Patch(':id/posts/:postId')
  updatePost(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('postId', new ParseUUIDPipe({ version: '4' })) postId: string,
    @Body() dto: UpdateOrganizationPostDto,
  ) {
    return this.organizations.updatePost(
      request.user.id,
      id,
      postId,
      dto,
    );
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Delete(':id/posts/:postId')
  async deletePost(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('postId', new ParseUUIDPipe({ version: '4' })) postId: string,
  ): Promise<void> {
    await this.organizations.deletePost(request.user.id, id, postId);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Post(':id/events')
  createEvent(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateOrganizationEventDto,
  ) {
    return this.organizations.createEvent(request.user.id, id, dto);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Patch(':id/events/:eventId')
  updateEvent(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() dto: UpdateOrganizationEventDto,
  ) {
    return this.organizations.updateEvent(
      request.user.id,
      id,
      eventId,
      dto,
    );
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Post(':id/links')
  createLink(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateOrganizationLinkDto,
  ) {
    return this.organizations.createLink(request.user.id, id, dto);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Delete(':id/links/:linkId')
  async deleteLink(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('linkId', new ParseUUIDPipe({ version: '4' })) linkId: string,
  ): Promise<void> {
    await this.organizations.deleteLink(request.user.id, id, linkId);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Put(':id/resources/:resourceId')
  featureResource(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('resourceId', new ParseUUIDPipe({ version: '4' }))
    resourceId: string,
  ) {
    return this.organizations.featureResource(
      request.user.id,
      id,
      resourceId,
    );
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Delete(':id/resources/:resourceId')
  async unfeatureResource(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('resourceId', new ParseUUIDPipe({ version: '4' }))
    resourceId: string,
  ): Promise<void> {
    await this.organizations.unfeatureResource(
      request.user.id,
      id,
      resourceId,
    );
  }
}
