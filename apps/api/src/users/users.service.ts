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
              role: 'user',
            },
          },
          { upsert: true },
        )
        .exec();
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }

  findByEmail(email: string) {
    return this.userModel.findOne({ email }).exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }
}
