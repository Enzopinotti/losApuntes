import type { FeedService } from '../../feeds/domain/feed.service';
import {
  FeedFeedbackExportContributor,
  FeedPreferencesExportContributor,
} from './account-export-feed.contributors';

describe('Feed account export contributors', () => {
  it('exports persisted owner preferences without internal revision data', async () => {
    const createdAt = new Date('2026-10-11T10:00:00.000Z');
    const updatedAt = new Date('2026-10-11T11:00:00.000Z');
    const findAccountExportPreferences = jest.fn().mockResolvedValue({
      useAcademic: false,
      useSocial: true,
      useInterests: false,
      mutedSubjectIds: ['subject-ref'],
      mutedProfileIds: ['profile-ref'],
      prioritizedSubjectIds: ['priority-ref'],
      createdAt,
      updatedAt,
      userId: 'must-not-escape',
      revision: 92,
    });
    const feeds = {
      findAccountExportPreferences,
    } as unknown as jest.Mocked<FeedService>;

    const page = await new FeedPreferencesExportContributor(feeds).readPage({
      userId: 'owner-user',
      cursor: null,
      limit: 100,
    });

    expect(page).toEqual({
      records: [
        {
          useAcademic: false,
          useSocial: true,
          useInterests: false,
          mutedSubjectIds: ['subject-ref'],
          mutedProfileIds: ['profile-ref'],
          prioritizedSubjectIds: ['priority-ref'],
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        },
      ],
      nextCursor: null,
    });
    expect(page.records[0]).not.toHaveProperty('userId');
    expect(page.records[0]).not.toHaveProperty('revision');
    expect(findAccountExportPreferences).toHaveBeenCalledWith('owner-user');
  });

  it('returns an empty preference section when no row was persisted', async () => {
    const findAccountExportPreferences = jest.fn().mockResolvedValue(null);
    const feeds = {
      findAccountExportPreferences,
    } as unknown as jest.Mocked<FeedService>;

    await expect(
      new FeedPreferencesExportContributor(feeds).readPage({
        userId: 'owner-user',
        cursor: null,
        limit: 100,
      }),
    ).resolves.toEqual({ records: [], nextCursor: null });
  });

  it('exports current feedback as opaque target references only', async () => {
    const createdAt = new Date('2026-10-11T10:00:00.000Z');
    const updatedAt = new Date('2026-10-11T11:00:00.000Z');
    const listAccountExportFeedback = jest.fn().mockResolvedValue({
      items: [
        {
          targetType: 'organization_post',
          targetId: 'target-ref',
          signal: 'less',
          createdAt,
          updatedAt,
          userId: 'must-not-escape',
          target: { title: 'must-not-escape' },
        },
      ],
      nextCursor: 'opaque-feed-cursor',
    });
    const feeds = {
      listAccountExportFeedback,
    } as unknown as jest.Mocked<FeedService>;

    const page = await new FeedFeedbackExportContributor(feeds).readPage({
      userId: 'owner-user',
      cursor: null,
      limit: 100,
    });

    expect(page).toEqual({
      records: [
        {
          targetType: 'organization_post',
          targetId: 'target-ref',
          signal: 'less',
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        },
      ],
      nextCursor: 'opaque-feed-cursor',
    });
    expect(page.records[0]).not.toHaveProperty('userId');
    expect(page.records[0]).not.toHaveProperty('target');
    expect(listAccountExportFeedback).toHaveBeenCalledWith('owner-user', {
      cursor: null,
      limit: 100,
    });
  });
});
