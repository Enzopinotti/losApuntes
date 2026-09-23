import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ProfileService } from '../../profile/domain/profile.service';
import { SOCIAL_STORE, type SocialStore } from './social.store';
import type { ConnectionRecord, SocialCursor } from './social.types';

function encodeCursor(cursor: SocialCursor): string {
  return Buffer.from(
    JSON.stringify({
      at: cursor.at.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(value?: string): SocialCursor | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    if (typeof parsed.at !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('invalid cursor');
    }

    const at = new Date(parsed.at);
    if (Number.isNaN(at.getTime())) throw new Error('invalid date');

    return { at, id: parsed.id };
  } catch {
    throw new UnprocessableEntityException({
      code: 'SOCIAL_CURSOR_INVALID',
      message: 'Social cursor is invalid',
    });
  }
}

@Injectable()
export class SocialService {
  constructor(
    @Inject(SOCIAL_STORE)
    private readonly store: SocialStore,
    private readonly profiles: ProfileService,
  ) {}

  async follow(userId: string, profileId: string) {
    const actor = await this.requireActorProfile(userId);
    const targetUserId = await this.resolveTarget(profileId);

    if (targetUserId === userId) this.selfRelation();

    await this.store.follow({
      id: randomUUID(),
      followerUserId: userId,
      followeeUserId: targetUserId,
      notification: {
        id: randomUUID(),
        userId: targetUserId,
        type: 'social.followed',
        actorUserId: userId,
        targetType: 'profile',
        targetId: actor.profileId,
        readAt: null,
      },
    });

    return { following: true };
  }

  async unfollow(userId: string, profileId: string): Promise<void> {
    const targetUserId = await this.resolveTarget(profileId);
    if (targetUserId === userId) this.selfRelation();
    await this.store.unfollow(userId, targetUserId);
  }

  async listFollowing(
    userId: string,
    limit: number,
    cursor?: string,
  ) {
    const rows = await this.store.listFollowing(
      userId,
      limit + 1,
      decodeCursor(cursor),
    );
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const items = await Promise.all(
      pageRows.map(async (row) => ({
        followedAt: row.createdAt.toISOString(),
        profile: await this.profiles.getAttributionForUser(row.followeeUserId),
      })),
    );
    const last = pageRows.at(-1);

    return {
      items: items.filter(
        (
          item,
        ): item is typeof item & {
          profile: NonNullable<typeof item.profile>;
        } => item.profile !== null,
      ),
      nextCursor:
        hasMore && last
          ? encodeCursor({ at: last.createdAt, id: last.id })
          : null,
    };
  }

  async requestConnection(userId: string, profileId: string) {
    await this.requireActorProfile(userId);
    const targetUserId = await this.resolveTarget(profileId);

    if (targetUserId === userId) this.selfRelation();

    const id = randomUUID();
    const result = await this.store.requestConnection({
      id,
      requesterUserId: userId,
      targetUserId,
      now: new Date(),
      notification: {
        id: randomUUID(),
        userId: targetUserId,
        type: 'social.connection_requested',
        actorUserId: userId,
        targetType: 'connection',
        targetId: id,
        readAt: null,
      },
    });

    return {
      connection: await this.projection(result.connection, userId),
    };
  }

  async listConnections(
    userId: string,
    status: ConnectionRecord['status'] | undefined,
    limit: number,
    cursor?: string,
  ) {
    const rows = await this.store.listConnections(
      userId,
      status,
      limit + 1,
      decodeCursor(cursor),
    );
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);

    return {
      items: await Promise.all(
        pageRows.map((row) => this.projection(row, userId)),
      ),
      nextCursor:
        hasMore && last
          ? encodeCursor({ at: last.updatedAt, id: last.id })
          : null,
    };
  }

  async respond(userId: string, id: string, status: 'accepted' | 'declined') {
    const current = await this.store.findConnectionById(id);
    this.assertParticipant(current, userId);

    if (current.status !== 'pending') {
      throw new ConflictException({
        code: 'SOCIAL_CONNECTION_STATE_CONFLICT',
        message: 'Connection request is not pending',
      });
    }

    if (current.requestedByUserId === userId) {
      throw new UnprocessableEntityException({
        code: 'SOCIAL_CONNECTION_RECIPIENT_REQUIRED',
        message: 'Only the request recipient may respond',
      });
    }

    const updated = await this.store.respondConnection({
      id,
      recipientUserId: userId,
      status,
      now: new Date(),
      ...(status === 'accepted'
        ? {
            notification: {
              id: randomUUID(),
              userId: current.requestedByUserId,
              type: 'social.connection_accepted' as const,
              actorUserId: userId,
              targetType: 'connection' as const,
              targetId: id,
              readAt: null,
            },
          }
        : {}),
    });

    if (!updated) {
      throw new ConflictException({
        code: 'SOCIAL_CONNECTION_STATE_CONFLICT',
        message: 'Connection changed concurrently',
      });
    }

    return { connection: await this.projection(updated, userId) };
  }

  async disconnect(userId: string, id: string): Promise<void> {
    const current = await this.store.findConnectionById(id);
    this.assertParticipant(current, userId);

    if (current.status !== 'accepted') {
      throw new ConflictException({
        code: 'SOCIAL_CONNECTION_STATE_CONFLICT',
        message: 'Only an accepted connection can be disconnected',
      });
    }

    const updated = await this.store.disconnectConnection(
      id,
      userId,
      new Date(),
    );

    if (!updated) {
      throw new ConflictException({
        code: 'SOCIAL_CONNECTION_STATE_CONFLICT',
        message: 'Connection changed concurrently',
      });
    }
  }

  private async requireActorProfile(userId: string) {
    const actor = await this.profiles.getAttributionForUser(userId);
    if (!actor) {
      throw new UnprocessableEntityException({
        code: 'SOCIAL_PROFILE_REQUIRED',
        message: 'Create a Profile before using social features',
      });
    }
    return actor;
  }

  private async resolveTarget(profileId: string): Promise<string> {
    const targetUserId =
      await this.profiles.resolveUserIdByProfileId(profileId);
    if (!targetUserId) this.profileNotFound();
    return targetUserId;
  }

  private assertParticipant(
    connection: ConnectionRecord | null,
    userId: string,
  ): asserts connection is ConnectionRecord {
    if (
      !connection ||
      (connection.userLowId !== userId && connection.userHighId !== userId)
    ) {
      this.connectionNotFound();
    }
  }

  private async projection(connection: ConnectionRecord, viewerUserId: string) {
    const otherUserId =
      connection.userLowId === viewerUserId
        ? connection.userHighId
        : connection.userLowId;
    const other = await this.profiles.getAttributionForUser(otherUserId);

    if (!other) this.connectionNotFound();

    return {
      id: connection.id,
      status: connection.status,
      other,
      requestedByMe: connection.requestedByUserId === viewerUserId,
      incoming:
        connection.status === 'pending' &&
        connection.requestedByUserId !== viewerUserId,
      respondedAt: connection.respondedAt?.toISOString() ?? null,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }

  private selfRelation(): never {
    throw new UnprocessableEntityException({
      code: 'SOCIAL_SELF_RELATION_INVALID',
      message: 'A user cannot create a social relation with themselves',
    });
  }

  private profileNotFound(): never {
    throw new NotFoundException({
      code: 'SOCIAL_PROFILE_NOT_FOUND',
      message: 'Profile was not found',
    });
  }

  private connectionNotFound(): never {
    throw new NotFoundException({
      code: 'SOCIAL_CONNECTION_NOT_FOUND',
      message: 'Connection was not found',
    });
  }
}
