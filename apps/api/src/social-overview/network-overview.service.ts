import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  SocialConnection,
  SocialFollow,
} from '../social/mongo/social.mongo-schemas';

export interface NetworkOverview {
  followingCount: number;
  followersCount: number;
  acceptedConnectionsCount: number;
  pendingIncomingCount: number;
  pendingOutgoingCount: number;
}

@Injectable()
export class NetworkOverviewService {
  constructor(
    @InjectModel(SocialFollow.name)
    private readonly follows: Model<SocialFollow>,
    @InjectModel(SocialConnection.name)
    private readonly connections: Model<SocialConnection>,
  ) {}

  async forOwner(ownerUserId: string): Promise<NetworkOverview> {
    // Exclude malformed self-relationships. Both branches remain anchored
    // to the authenticated participant, allowing existing indexes to be used.
    const otherParticipant = [
      { userLowId: ownerUserId, userHighId: { $ne: ownerUserId } },
      { userHighId: ownerUserId, userLowId: { $ne: ownerUserId } },
    ];

    // A pending request is incoming only when its requester matches the
    // *other* participant. Never treat arbitrary requester IDs as valid.
    const incomingParticipant = [
      {
        userLowId: ownerUserId,
        userHighId: { $ne: ownerUserId },
        $expr: { $eq: ['$requestedByUserId', '$userHighId'] },
      },
      {
        userHighId: ownerUserId,
        userLowId: { $ne: ownerUserId },
        $expr: { $eq: ['$requestedByUserId', '$userLowId'] },
      },
    ];

    const [
      followingCount,
      followersCount,
      acceptedConnectionsCount,
      pendingIncomingCount,
      pendingOutgoingCount,
    ] = await Promise.all([
      this.follows
        .countDocuments({
          followerUserId: ownerUserId,
          followeeUserId: { $ne: ownerUserId },
        })
        .exec(),
      this.follows
        .countDocuments({
          followeeUserId: ownerUserId,
          followerUserId: { $ne: ownerUserId },
        })
        .exec(),
      this.connections
        .countDocuments({
          status: 'accepted',
          $or: otherParticipant,
        })
        .exec(),
      this.connections
        .countDocuments({
          status: 'pending',
          $or: incomingParticipant,
        })
        .exec(),
      this.connections
        .countDocuments({
          status: 'pending',
          requestedByUserId: ownerUserId,
          $or: otherParticipant,
        })
        .exec(),
    ]);

    return {
      followingCount,
      followersCount,
      acceptedConnectionsCount,
      pendingIncomingCount,
      pendingOutgoingCount,
    };
  }
}
