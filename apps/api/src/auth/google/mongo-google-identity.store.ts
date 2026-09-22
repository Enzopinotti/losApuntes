import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import type {
  GoogleExternalIdentityRecord,
  GoogleExternalIdentityStore,
  GoogleIdentityLinkResult,
} from './google.types';
import {
  GoogleExternalIdentity,
  type GoogleExternalIdentityDocument,
} from './schemas/google-external-identity.schema';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function toRecord(
  document: GoogleExternalIdentityDocument,
): GoogleExternalIdentityRecord {
  return {
    id: document._id.toString(),
    provider: 'google',
    providerSubject: document.providerSubject,
    userId: document.userId,
    emailAtLink: document.emailAtLink,
    linkedAt: document.linkedAt,
  };
}

@Injectable()
export class MongoGoogleExternalIdentityStore implements GoogleExternalIdentityStore {
  constructor(
    @InjectModel(GoogleExternalIdentity.name)
    private readonly model: Model<GoogleExternalIdentityDocument>,
  ) {}

  async findBySubject(
    providerSubject: string,
  ): Promise<GoogleExternalIdentityRecord | null> {
    const document = await this.model
      .findOne({
        provider: 'google',
        providerSubject,
      })
      .exec();

    return document ? toRecord(document) : null;
  }

  async findForUser(
    userId: string,
  ): Promise<GoogleExternalIdentityRecord | null> {
    const document = await this.model
      .findOne({
        provider: 'google',
        userId,
      })
      .exec();

    return document ? toRecord(document) : null;
  }

  async link(input: {
    providerSubject: string;
    userId: string;
    emailAtLink: string;
    linkedAt: Date;
  }): Promise<GoogleIdentityLinkResult> {
    try {
      const document = await this.model.create({
        provider: 'google',
        providerSubject: input.providerSubject,
        userId: input.userId,
        emailAtLink: input.emailAtLink,
        linkedAt: input.linkedAt,
      });

      return {
        kind: 'linked',
        identity: toRecord(document),
      };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    const bySubject = await this.findBySubject(input.providerSubject);
    if (bySubject) {
      return {
        kind:
          bySubject.userId === input.userId
            ? 'already_linked'
            : 'subject_in_use',
        identity: bySubject,
      };
    }

    const byUser = await this.findForUser(input.userId);
    if (!byUser) {
      throw new Error('Google identity uniqueness conflict could not resolve');
    }

    return {
      kind: 'user_already_has_google',
      identity: byUser,
    };
  }

  async unlinkForUser(userId: string): Promise<boolean> {
    const result = await this.model
      .deleteOne({
        provider: 'google',
        userId,
      })
      .exec();

    return result.deletedCount === 1;
  }
}
