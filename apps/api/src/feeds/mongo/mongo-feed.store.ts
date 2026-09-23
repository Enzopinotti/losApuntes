import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';

import {
  type FeedStore,
  type UpdateFeedPreferencesRecord,
} from '../domain/feed.store';
import type {
  FeedFeedbackRecord,
  FeedFeedbackSignal,
  FeedPreferencesRecord,
  FeedTargetType,
} from '../domain/feed.types';
import { FeedFeedback, FeedPreferences } from './feed.mongo-schemas';

const DEFAULT_PREFERENCES = Object.freeze({
  useAcademic: true,
  useSocial: true,
  useInterests: true,
  mutedSubjectIds: [] as string[],
  mutedProfileIds: [] as string[],
  prioritizedSubjectIds: [] as string[],
  revision: 1,
});

@Injectable()
export class MongoFeedStore implements FeedStore {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(FeedPreferences.name)
    private readonly preferences: Model<FeedPreferences>,
    @InjectModel(FeedFeedback.name)
    private readonly feedback: Model<FeedFeedback>,
  ) {}

  async getOrCreatePreferences(userId: string): Promise<FeedPreferencesRecord> {
    const row = await this.preferences
      .findOneAndUpdate(
        { userId },
        {
          $setOnInsert: {
            userId,
            ...DEFAULT_PREFERENCES,
          },
        },
        { upsert: true, new: true },
      )
      .lean<FeedPreferencesRecord>()
      .exec();

    if (!row) throw new Error('Feed preferences upsert returned no row');
    return row;
  }

  async updatePreferences(
    userId: string,
    expectedRevision: number,
    patch: UpdateFeedPreferencesRecord,
  ): Promise<FeedPreferencesRecord | null> {
    return this.preferences
      .findOneAndUpdate(
        { userId, revision: expectedRevision },
        { $set: patch, $inc: { revision: 1 } },
        { new: true },
      )
      .lean<FeedPreferencesRecord>()
      .exec();
  }

  async listFeedback(
    userId: string,
    targets: Array<{ targetType: FeedTargetType; targetId: string }>,
  ): Promise<FeedFeedbackRecord[]> {
    if (targets.length === 0) return [];

    const resources = targets
      .filter((target) => target.targetType === 'resource')
      .map((target) => target.targetId);
    const questions = targets
      .filter((target) => target.targetType === 'question')
      .map((target) => target.targetId);
    const filters: Array<Record<string, unknown>> = [];

    if (resources.length > 0) {
      filters.push({ targetType: 'resource', targetId: { $in: resources } });
    }
    if (questions.length > 0) {
      filters.push({ targetType: 'question', targetId: { $in: questions } });
    }

    return this.feedback
      .find({ userId, $or: filters })
      .lean<FeedFeedbackRecord[]>()
      .exec();
  }

  async setFeedback(input: {
    userId: string;
    targetType: FeedTargetType;
    targetId: string;
    signal: FeedFeedbackSignal;
  }): Promise<{
    feedback: FeedFeedbackRecord;
    changed: boolean;
    revision: number;
  }> {
    const session = await this.connection.startSession();

    try {
      let output:
        | {
            feedback: FeedFeedbackRecord;
            changed: boolean;
            revision: number;
          }
        | undefined;

      await session.withTransaction(async () => {
        const preferences = await this.preferences
          .findOneAndUpdate(
            { userId: input.userId },
            {
              $setOnInsert: {
                userId: input.userId,
                ...DEFAULT_PREFERENCES,
              },
            },
            { upsert: true, new: true, session },
          )
          .lean<FeedPreferencesRecord>()
          .exec();

        if (!preferences) {
          throw new Error('Feed preferences upsert returned no row');
        }

        const current = await this.feedback
          .findOne({
            userId: input.userId,
            targetType: input.targetType,
            targetId: input.targetId,
          })
          .session(session)
          .lean<FeedFeedbackRecord>()
          .exec();

        if (current?.signal === input.signal) {
          output = {
            feedback: current,
            changed: false,
            revision: preferences.revision,
          };
          return;
        }

        const feedback = await this.feedback
          .findOneAndUpdate(
            {
              userId: input.userId,
              targetType: input.targetType,
              targetId: input.targetId,
            },
            {
              $set: { signal: input.signal },
              $setOnInsert: {
                userId: input.userId,
                targetType: input.targetType,
                targetId: input.targetId,
              },
            },
            { upsert: true, new: true, session },
          )
          .lean<FeedFeedbackRecord>()
          .exec();

        const next = await this.preferences
          .findOneAndUpdate(
            { userId: input.userId, revision: preferences.revision },
            { $inc: { revision: 1 } },
            { new: true, session },
          )
          .lean<FeedPreferencesRecord>()
          .exec();

        if (!feedback || !next) {
          throw new Error('Feed feedback transaction lost state');
        }

        output = {
          feedback,
          changed: true,
          revision: next.revision,
        };
      });

      if (!output) throw new Error('Feed feedback transaction returned no row');
      return output;
    } finally {
      await session.endSession();
    }
  }

  async clearFeedback(input: {
    userId: string;
    targetType: FeedTargetType;
    targetId: string;
  }): Promise<{ changed: boolean; revision: number }> {
    const session = await this.connection.startSession();

    try {
      let output: { changed: boolean; revision: number } | undefined;

      await session.withTransaction(async () => {
        const preferences = await this.preferences
          .findOneAndUpdate(
            { userId: input.userId },
            {
              $setOnInsert: {
                userId: input.userId,
                ...DEFAULT_PREFERENCES,
              },
            },
            { upsert: true, new: true, session },
          )
          .lean<FeedPreferencesRecord>()
          .exec();

        if (!preferences) {
          throw new Error('Feed preferences upsert returned no row');
        }

        const deleted = await this.feedback
          .deleteOne(
            {
              userId: input.userId,
              targetType: input.targetType,
              targetId: input.targetId,
            },
            { session },
          )
          .exec();

        if (deleted.deletedCount === 0) {
          output = { changed: false, revision: preferences.revision };
          return;
        }

        const next = await this.preferences
          .findOneAndUpdate(
            { userId: input.userId, revision: preferences.revision },
            { $inc: { revision: 1 } },
            { new: true, session },
          )
          .lean<FeedPreferencesRecord>()
          .exec();

        if (!next) throw new Error('Feed preference revision changed');

        output = { changed: true, revision: next.revision };
      });

      if (!output) throw new Error('Feed feedback clear returned no result');
      return output;
    } finally {
      await session.endSession();
    }
  }
}
