import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  ProfileAlreadyExistsError,
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
  ) {}

  async findProfileByUserId(userId: string): Promise<ProfileRecord | null> {
    return this.profiles.findOne({ userId }).lean<ProfileRecord>().exec();
  }

  async findProfileById(id: string): Promise<ProfileRecord | null> {
    return this.profiles.findOne({ id }).lean<ProfileRecord>().exec();
  }

  async createProfile(input: CreateProfileRecord): Promise<ProfileRecord> {
    try {
      const created = await this.profiles.create(input);
      return toPlain<ProfileRecord>(created);
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ProfileAlreadyExistsError();
      throw error;
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
    userId: string,
  ): Promise<ProfileActivityRecord[]> {
    return this.activities
      .find({ userId })
      .sort({ updatedAt: -1, id: 1 })
      .lean<ProfileActivityRecord[]>()
      .exec();
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
