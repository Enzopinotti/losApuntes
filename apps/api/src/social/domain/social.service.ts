import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PilotEventService } from '../../pilot/telemetry/pilot-event.service';
import { ProfileService } from '../../profile/domain/profile.service';
import {
  decodeConnectionRequestCursor,
  encodeConnectionRequestCursor,
  type ConnectionRequestDirection,
} from './connection-request.cursor';
import {
  SOCIAL_STORE,
  SocialParticipantInactiveError,
  type SocialStore,
} from './social.store';
import type {
  ConnectionAccountExportRow,
  ConnectionRecord,
  SocialCursor,
} from './social.types';

const SOCIAL_ACCOUNT_EXPORT_MAX_LIMIT = 100;

function assertAccountExportLimit(limit: number): void {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > SOCIAL_ACCOUNT_EXPORT_MAX_LIMIT
  ) {
    throw new UnprocessableEntityException({
      code: 'SOCIAL_ACCOUNT_EXPORT_LIMIT_INVALID',
      message: 'Social account export limit is invalid',
    });
  }
}

function encodeAccountExportCursor(cursor: SocialCursor): string {
  return Buffer.from(
    JSON.stringify({ at: cursor.at.toISOString(), id: cursor.id }),
    'utf8',
  ).toString('base64url');
}

function decodeAccountExportCursor(
  value: string | null,
): SocialCursor | undefined {
  if (value === null) return undefined;

  try {
    if (
      value.length === 0 ||
      value.length > 512 ||
      !/^[A-Za-z0-9_-]+$/u.test(value)
    ) {
      throw new Error('invalid cursor encoding');
    }

    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) {
      throw new Error('noncanonical cursor encoding');
    }

    const parsed: unknown = JSON.parse(decoded.toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('invalid cursor payload');
    }

    const cursor = parsed as Record<string, unknown>;
    const keys = Object.keys(cursor);
    if (
      keys.length !== 2 ||
      !keys.includes('at') ||
      !keys.includes('id') ||
      typeof cursor.at !== 'string' ||
      typeof cursor.id !== 'string' ||
      cursor.id.length === 0 ||
      cursor.id.length > 128
    ) {
      throw new Error('invalid cursor fields');
    }

    const at = new Date(cursor.at);
    if (Number.isNaN(at.getTime()) || at.toISOString() !== cursor.at) {
      throw new Error('invalid cursor timestamp');
    }

    return { at, id: cursor.id };
  } catch {
    throw new UnprocessableEntityException({
      code: 'SOCIAL_ACCOUNT_EXPORT_CURSOR_INVALID',
      message: 'Social account export cursor is invalid',
    });
  }
}

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
    private readonly events: PilotEventService,
  ) {}

  async follow(userId: string, profileId: string) {
    const actor = await this.requireActorProfile(userId);
    const targetUserId = await this.resolveTarget(profileId);

    if (targetUserId === userId) this.selfRelation();

    const result = await this.withActiveParticipants(() =>
      this.store.follow({
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
      }),
    );

    if (result.created) {
      await this.events.recordBestEffort({
        event: 'pilot.follow_created',
        userId,
      });
    }

    return { following: true };
  }

  async unfollow(userId: string, profileId: string): Promise<void> {
    const targetUserId = await this.resolveTarget(profileId);
    if (targetUserId === userId) this.selfRelation();
    await this.store.unfollow(userId, targetUserId);
  }

  async listFollowing(userId: string, limit: number, cursor?: string) {
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
    const result = await this.withActiveParticipants(() =>
      this.store.requestConnection({
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
      }),
    );

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

  /**
   * Actionable pending connection requests. Direction and authenticated owner
   * are database predicates, never a client-side filtered full relation page.
   */
  async listConnectionRequests(
    userId: string,
    direction: ConnectionRequestDirection,
    limit: number,
    cursor?: string,
  ) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) {
      throw new UnprocessableEntityException({
        code: 'SOCIAL_REQUEST_LIMIT_INVALID',
        message: 'Request page size must be between 1 and 25',
      });
    }
    const after = decodeConnectionRequestCursor(userId, direction, cursor);
    const rows = await this.store.listConnections(
      userId,
      'pending',
      limit + 1,
      after,
      direction,
    );
    if (!Array.isArray(rows) || rows.length > limit + 1) {
      this.invalidRequestData();
    }
    const pageRows = rows.slice(0, limit);
    for (const row of pageRows) {
      const isParticipant =
        row.userLowId === userId || row.userHighId === userId;
      const isRequester = row.requestedByUserId === userId;
      const requesterIsParticipant =
        row.requestedByUserId === row.userLowId ||
        row.requestedByUserId === row.userHighId;
      if (
        !isParticipant ||
        row.userLowId === row.userHighId ||
        !requesterIsParticipant ||
        row.status !== 'pending' ||
        (direction === 'outgoing') !== isRequester ||
        !(row.updatedAt instanceof Date) ||
        !Number.isFinite(row.updatedAt.getTime())
      ) {
        this.invalidRequestData();
      }
    }
    const last = pageRows.at(-1);
    return {
      items: await Promise.all(
        pageRows.map((row) => this.projection(row, userId)),
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeConnectionRequestCursor(userId, direction, {
              at: last.updatedAt,
              id: last.id,
            })
          : null,
    };
  }

  async countIncomingConnectionRequests(userId: string) {
    const pendingCount =
      await this.store.countIncomingConnectionRequests(userId);
    if (!Number.isSafeInteger(pendingCount) || pendingCount < 0) {
      this.invalidRequestData();
    }
    return { pendingIncomingCount: pendingCount };
  }

  private invalidRequestData(): never {
    throw new ServiceUnavailableException({
      code: 'SOCIAL_REQUEST_DATA_INVALID',
      message: 'Connection request inbox could not be read safely',
    });
  }

  async listAccountExportFollowing(
    userId: string,
    input: { limit: number; cursor: string | null },
  ): Promise<{
    items: Array<{ followeeProfileId: string; followedAt: string }>;
    nextCursor: string | null;
  }> {
    assertAccountExportLimit(input.limit);
    const page = await this.store.listFollowingForAccountExport(
      userId,
      input.limit,
      decodeAccountExportCursor(input.cursor),
    );
    const profileIds = await this.profiles.getProfileIdsForAccountExport(
      page.items.map((row) => row.followeeUserId),
    );
    const items = page.items.map((row) => ({
      followeeProfileId: this.requireExportProfileId(
        profileIds,
        row.followeeUserId,
      ),
      followedAt: row.createdAt.toISOString(),
    }));
    const last = page.items.at(-1);

    return {
      items,
      nextCursor:
        page.hasMore && last
          ? encodeAccountExportCursor({ at: last.createdAt, id: last.id })
          : null,
    };
  }

  async listAccountExportConnections(
    userId: string,
    input: { limit: number; cursor: string | null },
  ): Promise<{
    items: Array<{
      counterpartProfileId: string;
      status: ConnectionAccountExportRow['status'];
      requestedByOwner: boolean;
      createdAt: string;
      respondedAt: string | null;
      updatedAt: string;
    }>;
    nextCursor: string | null;
  }> {
    assertAccountExportLimit(input.limit);
    const page = await this.store.listConnectionsForAccountExport(
      userId,
      input.limit,
      decodeAccountExportCursor(input.cursor),
    );
    const counterpartUserIds = page.items.map((row) =>
      this.requireConnectionCounterpart(row, userId),
    );
    const profileIds =
      await this.profiles.getProfileIdsForAccountExport(counterpartUserIds);
    const items = page.items.map((row, index) => ({
      counterpartProfileId: this.requireExportProfileId(
        profileIds,
        counterpartUserIds[index],
      ),
      status: row.status,
      requestedByOwner: row.requestedByUserId === userId,
      createdAt: row.createdAt.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));
    const last = page.items.at(-1);

    return {
      items,
      nextCursor:
        page.hasMore && last
          ? encodeAccountExportCursor({ at: last.updatedAt, id: last.id })
          : null,
    };
  }

  async getFeedRelations(userId: string) {
    const limit = 500;
    const [following, connections] = await Promise.all([
      this.store.listFollowing(userId, limit + 1),
      this.store.listConnections(userId, 'accepted', limit + 1),
    ]);

    const followingPage = following.slice(0, limit);
    const connectionPage = connections.slice(0, limit);

    return {
      followingUserIds: [
        ...new Set(followingPage.map((row) => row.followeeUserId)),
      ],
      connectionUserIds: [
        ...new Set(
          connectionPage.map((row) =>
            row.userLowId === userId ? row.userHighId : row.userLowId,
          ),
        ),
      ],
      truncated: following.length > limit || connections.length > limit,
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

    const updated = await this.withActiveParticipants(() =>
      this.store.respondConnection({
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
      }),
    );

    if (!updated) {
      throw new ConflictException({
        code: 'SOCIAL_CONNECTION_STATE_CONFLICT',
        message: 'Connection changed concurrently',
      });
    }

    if (status === 'accepted') {
      await this.events.recordBestEffort({
        event: 'pilot.connection_accepted',
        userId,
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

  private async withActiveParticipants<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SocialParticipantInactiveError) {
        this.profileNotFound();
      }
      throw error;
    }
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

  private requireExportProfileId(
    profileIds: ReadonlyMap<string, string>,
    userId: string,
  ): string {
    const profileId = profileIds.get(userId);
    if (!profileId) this.profileNotFound();
    return profileId;
  }

  private requireConnectionCounterpart(
    connection: ConnectionAccountExportRow,
    ownerUserId: string,
  ): string {
    const ownerIsLow = connection.userLowId === ownerUserId;
    const ownerIsHigh = connection.userHighId === ownerUserId;
    const requesterIsParticipant =
      connection.requestedByUserId === connection.userLowId ||
      connection.requestedByUserId === connection.userHighId;
    if (ownerIsLow === ownerIsHigh || !requesterIsParticipant) {
      throw new Error('Account export Connection participant is invalid');
    }

    return ownerIsLow ? connection.userHighId : connection.userLowId;
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
