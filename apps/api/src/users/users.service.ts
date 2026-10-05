import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User, UserDocument } from './schemas/user.schema';

export type UserAccountExportProjection = {
  id: string;
  email: string;
  username: string | null;
  emailVerifiedAt: string | null;
  accountStatus: 'active' | 'restricted' | 'closed';
  accountClosedAt: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  careerId: number | null;
  cohortYear: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type UserAccountExportRow = {
  _id: unknown;
  email: string;
  username?: string;
  email_verified_at?: Date | null;
  account_status?: 'active' | 'restricted' | 'closed';
  account_closed_at?: Date | null;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  career_id?: number;
  cohort_year?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export const USER_ACCOUNT_EXPORT_SELECT = {
  _id: 1,
  email: 1,
  username: 1,
  email_verified_at: 1,
  account_status: 1,
  account_closed_at: 1,
  full_name: 1,
  avatar_url: 1,
  bio: 1,
  career_id: 1,
  cohort_year: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  create(data: Partial<User>) {
    return this.userModel.create(data);
  }

  async createPasswordAccountIfAbsent(
    email: string,
    passwordHash: string,
  ): Promise<void> {
    try {
      await this.userModel
        .updateOne(
          { email },
          {
            $setOnInsert: {
              email,
              password_hash: passwordHash,
              email_verified_at: null,
              credential_version: 1,
              account_status: 'active',
              role: 'user',
              platform_permissions: [],
            },
          },
          { upsert: true },
        )
        .exec();
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }

  async createGoogleAccountIfEmailFree(
    email: string,
    verifiedAt: Date,
  ): Promise<UserDocument | null> {
    try {
      return await this.userModel.create({
        email,
        email_verified_at: verifiedAt,
        credential_version: 1,
        account_status: 'active',
        role: 'user',
        platform_permissions: [],
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      return null;
    }
  }

  async deleteGoogleOnlyAccountIfUnclaimed(userId: string): Promise<void> {
    await this.userModel
      .deleteOne({
        _id: userId,
        password_hash: { $exists: false },
        credential_version: 1,
      })
      .exec();
  }

  findByEmail(email: string) {
    return this.userModel.findOne({ email }).exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  async getAccountExportProjection(
    userId: string,
  ): Promise<UserAccountExportProjection | null> {
    const row = await this.userModel
      .findById(userId)
      .select(USER_ACCOUNT_EXPORT_SELECT)
      .lean<UserAccountExportRow>()
      .exec();

    if (!row) return null;

    return {
      id: String(row._id),
      email: row.email,
      username: row.username ?? null,
      emailVerifiedAt: row.email_verified_at?.toISOString() ?? null,
      accountStatus: row.account_status ?? 'active',
      accountClosedAt: row.account_closed_at?.toISOString() ?? null,
      fullName: row.full_name ?? null,
      avatarUrl: row.avatar_url ?? null,
      bio: row.bio ?? null,
      careerId: row.career_id ?? null,
      cohortYear: row.cohort_year ?? null,
      createdAt: row.createdAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  }

  async hasPlatformPermission(
    userId: string,
    permission: string,
  ): Promise<boolean> {
    return Boolean(
      await this.userModel
        .exists({ _id: userId, platform_permissions: permission })
        .exec(),
    );
  }

  async replacePasswordHashIfCurrent(
    userId: string,
    currentPasswordHash: string,
    replacementPasswordHash: string,
  ): Promise<boolean> {
    const result = await this.userModel
      .updateOne(
        {
          _id: userId,
          password_hash: currentPasswordHash,
        },
        {
          $set: {
            password_hash: replacementPasswordHash,
          },
        },
      )
      .exec();

    return result.modifiedCount === 1;
  }

  async markEmailVerifiedIfUnverified(
    userId: string,
    verifiedAt: Date,
  ): Promise<boolean> {
    const result = await this.userModel
      .updateOne(
        {
          _id: userId,
          email_verified_at: null,
        },
        {
          $set: {
            email_verified_at: verifiedAt,
          },
        },
      )
      .exec();

    return result.modifiedCount === 1;
  }

  async replacePasswordIfCredentialVersion(
    userId: string,
    expectedCredentialVersion: number,
    passwordHash: string,
  ): Promise<boolean> {
    const credentialVersionFilter =
      expectedCredentialVersion === 1
        ? {
            $or: [
              { credential_version: 1 },
              { credential_version: { $exists: false } },
            ],
          }
        : { credential_version: expectedCredentialVersion };

    const result = await this.userModel
      .updateOne(
        {
          _id: userId,
          ...credentialVersionFilter,
        },
        {
          $set: {
            password_hash: passwordHash,
            credential_version: expectedCredentialVersion + 1,
          },
        },
      )
      .exec();

    return result.modifiedCount === 1;
  }
}
