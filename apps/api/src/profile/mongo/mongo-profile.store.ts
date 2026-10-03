import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';

import { User } from '../../users/schemas/user.schema';
import {
  ProfileAlreadyExistsError,
  ProfileAccountInactiveError,
  type CreateProfileActivityRecord,
  type CreateProfileRecord,
  type ProfileStore,
  type UpdateProfileActivityRecord,
  type UpdateProfileRecord,
} from '../domain/profile.store';
import type {
  ProfileActivityRecord,
  ProfileRecord,
} from '../domain/profile.types';
import { Profile, ProfileActivity } from './profile.mongo-schemas';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, (character) => '\\' + character);
}

function toPlain<T>(value: { toObject(): unknown } | T): T {
  if (
    typeof value === 'object' &&
    value !== null &&
    'toObject' in value &&
    typeof value.toObject === 'function'
  ) {
    return value.toObject() as T;
  }

  return value as T;
}

@Injectable()
export class MongoProfileStore implements ProfileStore {
  constructor(
    @InjectModel(Profile.name)
    private readonly profiles: Model<Profile>,
    @InjectModel(ProfileActivity.name)
    private readonly activities: Model<ProfileActivity>,
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(User.name)
    private readonly users: Model<User>,
  ) {}

  async findProfileByUserId(userId: string): Promise<ProfileRecord | null> {
    return this.profiles.findOne({ userId }).lean<ProfileRecord>().exec();
  }

  async findProfileById(id: string): Promise<ProfileRecord | null> {
    return this.profiles.findOne({ id }).lean<ProfileRecord>().exec();
  }

  async findProfilesByUserIds(userIds: string[]): Promise<ProfileRecord[]> {
    if (userIds.length === 0) return [];

    return this.profiles
      .find({ userId: { $in: userIds } })
      .lean<ProfileRecord[]>()
      .exec();
  }

  async searchPublicProfiles(
    query: string,
    limit: number,
  ): Promise<ProfileRecord[]> {
    return this.profiles
      .find({
        $or: [
          { lifecycleState: 'active' },
          { lifecycleState: { $exists: false } },
        ],
        'visibility.about': 'public',
        displayName: { $regex: escapeRegex(query), $options: 'i' },
      })
      .sort({ displayName: 1, id: 1 })
      .limit(limit)
      .lean<ProfileRecord[]>()
      .exec();
  }

  async createProfile(input: CreateProfileRecord): Promise<ProfileRecord> {
    const session = await this.connection.startSession();

    try {
      let createdProfile: ProfileRecord | undefined;

      await session.withTransaction(async () => {
        const activeUser = await this.users
          .findOneAndUpdate(
            {
              _id: input.userId,
              $or: [
                { account_status: 'active' },
                { account_status: { $exists: false } },
              ],
            },
            { $inc: { account_lifecycle_revision: 1 } },
            { new: false, session },
          )
          .lean()
          .exec();

        if (!activeUser) throw new ProfileAccountInactiveError();

        const [created] = await this.profiles.create([input], { session });
        createdProfile = toPlain<ProfileRecord>(created);
      });

      if (!createdProfile) {
        throw new Error('Profile creation transaction produced no result');
      }

      return createdProfile;
    } catch (error) {
      if (error instanceof ProfileAccountInactiveError) throw error;
      if (isDuplicateKeyError(error)) throw new ProfileAlreadyExistsError();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async updateProfile(
    userId: string,
    expectedRevision: number,
    patch: UpdateProfileRecord,
  ): Promise<ProfileRecord | null> {
    return this.profiles
      .findOneAndUpdate(
        { userId, revision: expectedRevision },
        { $set: patch, $inc: { revision: 1 } },
        { new: true },
      )
      .lean<ProfileRecord>()
      .exec();
  }

  async listActivitiesForUser(
    input: Parameters<ProfileStore['listActivitiesForUser']>[0],
  ): ReturnType<ProfileStore['listActivitiesForUser']> {
    const rows = await this.activities
      .find({
        userId: input.userId,
        ...(input.after
          ? {
              $or: [
                { createdAt: { $lt: input.after.createdAt } },
                {
                  createdAt: input.after.createdAt,
                  id: { $gt: input.after.id },
                },
              ],
            }
          : {}),
      })
      .sort({ createdAt: -1, id: 1 })
      .limit(input.limit + 1)
      .lean<ProfileActivityRecord[]>()
      .exec();

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async findActivityForUser(
    userId: string,
    id: string,
  ): Promise<ProfileActivityRecord | null> {
    return this.activities
      .findOne({ id, userId })
      .lean<ProfileActivityRecord>()
      .exec();
  }

  async createActivity(
    input: CreateProfileActivityRecord,
  ): Promise<ProfileActivityRecord> {
    const created = await this.activities.create(input);
    return toPlain<ProfileActivityRecord>(created);
  }

  async updateActivity(
    userId: string,
    id: string,
    expectedRevision: number,
    patch: UpdateProfileActivityRecord,
  ): Promise<ProfileActivityRecord | null> {
    return this.activities
      .findOneAndUpdate(
        { id, userId, revision: expectedRevision },
        { $set: patch, $inc: { revision: 1 } },
        { new: true },
      )
      .lean<ProfileActivityRecord>()
      .exec();
  }

  async deleteActivity(
    userId: string,
    id: string,
    expectedRevision: number,
  ): Promise<boolean> {
    const result = await this.activities
      .deleteOne({ id, userId, revision: expectedRevision })
      .exec();

    return result.deletedCount === 1;
  }
}
