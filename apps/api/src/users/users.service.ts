import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User, UserDocument } from './schemas/user.schema';

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
