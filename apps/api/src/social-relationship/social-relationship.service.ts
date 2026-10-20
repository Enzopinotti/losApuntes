import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { ProfileService } from '../profile/domain/profile.service';
import { CONNECTION_STATUSES } from '../social/domain/social.types';
import {
  SocialConnection,
  SocialFollow,
} from '../social/mongo/social.mongo-schemas';

interface FollowEdge {
  followerUserId: string;
  followeeUserId: string;
}

interface ConnectionSnapshot {
  id: string;
  userLowId: string;
  userHighId: string;
  requestedByUserId: string;
  status: string;
  respondedAt: Date | null;
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function unsafeRelationship(): never {
  throw new ServiceUnavailableException({
    code: 'SOCIAL_RELATIONSHIP_DATA_INVALID',
    message: 'Relationship state could not be read safely',
  });
}

function unknownProfile(): never {
  throw new NotFoundException({
    code: 'SOCIAL_RELATIONSHIP_PROFILE_NOT_FOUND',
    message: 'Public profile was not found',
  });
}

/**
 * Read-only, owner-aware state for buttons on someone else's public profile.
 * The database always checks both participants; no arbitrary account IDs are
 * ever received from a client or included in the response.
 */
@Injectable()
export class SocialRelationshipService {
  constructor(
    @InjectModel(SocialFollow.name)
    private readonly follows: Model<SocialFollow>,
    @InjectModel(SocialConnection.name)
    private readonly connections: Model<SocialConnection>,
    private readonly profiles: ProfileService,
  ) {}

  async get(viewerUserId: string, profileId: string) {
    if (!viewerUserId || !viewerUserId.trim()) {
      throw new UnprocessableEntityException({
        code: 'SOCIAL_RELATIONSHIP_VIEWER_REQUIRED',
        message: 'Authenticated account is required',
      });
    }

    // Reuse the public profile visibility and lifecycle boundary, including
    // closed profiles returning Not Found. Do not return its full projection.
    await this.profiles.getPublicProfile(profileId);
    const targetUserId = await this.profiles.resolveUserIdByProfileId(profileId);
    if (!targetUserId) return unknownProfile();

    if (viewerUserId === targetUserId) {
      return {
        isSelf: true,
        isFollowing: false,
        followsYou: false,
        connection: null,
      };
    }

    const [userLowId, userHighId] =
      viewerUserId < targetUserId
        ? [viewerUserId, targetUserId]
        : [targetUserId, viewerUserId];

    const [outgoing, incoming, connection] = await Promise.all([
      this.follows
        .findOne({
          followerUserId: viewerUserId,
          followeeUserId: targetUserId,
        })
        .select({ _id: 0, followerUserId: 1, followeeUserId: 1 })
        .lean<FollowEdge>()
        .exec(),
      this.follows
        .findOne({
          followerUserId: targetUserId,
          followeeUserId: viewerUserId,
        })
        .select({ _id: 0, followerUserId: 1, followeeUserId: 1 })
        .lean<FollowEdge>()
        .exec(),
      this.connections
        .findOne({ userLowId, userHighId })
        .select({
          _id: 0,
          id: 1,
          userLowId: 1,
          userHighId: 1,
          requestedByUserId: 1,
          status: 1,
          respondedAt: 1,
        })
        .lean<ConnectionSnapshot>()
        .exec(),
    ]);

    if (
      (outgoing !== null &&
        (outgoing.followerUserId !== viewerUserId ||
          outgoing.followeeUserId !== targetUserId)) ||
      (incoming !== null &&
        (incoming.followerUserId !== targetUserId ||
          incoming.followeeUserId !== viewerUserId))
    ) {
      return unsafeRelationship();
    }

    if (
      connection !== null &&
      (!UUID_V4.test(connection.id) ||
        connection.userLowId !== userLowId ||
        connection.userHighId !== userHighId ||
        (connection.requestedByUserId !== viewerUserId &&
          connection.requestedByUserId !== targetUserId) ||
        !CONNECTION_STATUSES.some((state) => state === connection.status) ||
        (connection.respondedAt !== null &&
          (!(connection.respondedAt instanceof Date) ||
            !Number.isFinite(connection.respondedAt.getTime()))) ||
        (connection.status === 'pending' && connection.respondedAt !== null))
    ) {
      return unsafeRelationship();
    }

    return {
      isSelf: false,
      isFollowing: outgoing !== null,
      followsYou: incoming !== null,
      connection:
        connection === null
          ? null
          : {
              id: connection.id,
              status: connection.status,
              requestedByMe: connection.requestedByUserId === viewerUserId,
              incoming:
                connection.status === 'pending' &&
                connection.requestedByUserId === targetUserId,
              respondedAt: connection.respondedAt?.toISOString() ?? null,
            },
    };
  }
}
