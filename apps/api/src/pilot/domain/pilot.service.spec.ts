import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AcademicLifecycleService } from '../../academic/domain/academic-lifecycle.service';
import type { AcademicService } from '../../academic/domain/academic.service';
import type { FeedService } from '../../feeds/domain/feed.service';
import type { NotificationService } from '../../notifications/domain/notification.service';
import type { ProfileService } from '../../profile/domain/profile.service';
import type { PilotEventService } from '../telemetry/pilot-event.service';
import {
  PilotModerationTargetNotFoundError,
  PilotReportAlreadyReviewedError,
  PilotReportNotFoundError,
  type PilotMetricsSnapshot,
  type PilotStore,
} from './pilot.store';
import { PilotService } from './pilot.service';
import type { PilotModerationQueueItem } from './pilot.types';

const now = new Date('2026-09-23T18:00:00.000Z');

function store(): jest.Mocked<PilotStore> {
  return {
    listModeration: jest.fn(),
    reviewModeration: jest.fn(),
    metrics: jest.fn(),
  };
}

function deps() {
  return {
    academic: {
      getCurrentContext: jest.fn(),
      listSubjectParticipations: jest.fn(),
      getCatalogNode: jest.fn(),
    },
    lifecycle: {
      getLifecycle: jest.fn().mockResolvedValue({ phase: 'student' }),
    },
    profiles: {
      getOwnerProfile: jest.fn(),
    },
    feeds: {
      academicFeed: jest.fn(),
      forYou: jest.fn(),
    },
    notifications: {
      countUnread: jest.fn(),
    },
    events: {
      recordBestEffort: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function service(
  pilotStore: jest.Mocked<PilotStore>,
  dependencies: ReturnType<typeof deps>,
) {
  return new PilotService(
    pilotStore,
    dependencies.academic as unknown as AcademicService,
    dependencies.lifecycle as unknown as AcademicLifecycleService,
    dependencies.profiles as unknown as ProfileService,
    dependencies.feeds as unknown as FeedService,
    dependencies.notifications as unknown as NotificationService,
    dependencies.events as unknown as PilotEventService,
  );
}

function moderation(
  overrides: Partial<PilotModerationQueueItem> = {},
): PilotModerationQueueItem {
  return {
    kind: 'resource',
    reportId: '11111111-1111-4111-8111-111111111111',
    targetKind: 'resource',
    targetId: '22222222-2222-4222-8222-222222222222',
    reason: 'spam',
    details: 'Contenido duplicado',
    status: 'pending',
    reporterUserId: 'reporter-1',
    createdAt: now,
    target: {
      title: 'Apunte',
      preview: 'Contenido',
      moderationState: 'available',
    },
    ...overrides,
  };
}

function metrics(
  overrides: Partial<PilotMetricsSnapshot> = {},
): PilotMetricsSnapshot {
  return {
    window: {
      from: new Date('2026-09-09T18:00:00.000Z'),
      to: now,
      days: 14,
    },
    onboarding: {
      accountsCreated: 10,
      profilesCompleted: 8,
      dropOff: 2,
    },
    search: {
      searches: 20,
      noResultSearches: 5,
    },
    activity: {
      activeUsers: 8,
      returningUsers: 4,
    },
    audience: {
      activeStudents: {
        activeUsers: 5,
        returningUsers: 3,
      },
      alumni: {
        activeUsers: 2,
        returningUsers: 1,
      },
      community: {
        activeUsers: 1,
        returningUsers: 0,
      },
    },
    contributions: {
      events: 12,
      contributors: 6,
    },
    moderation: {
      pending: 2,
      reviewedInWindow: 3,
      oldestPendingAt: new Date('2026-09-20T18:00:00.000Z'),
    },
    subjects: [
      {
        subjectId: '33333333-3333-4333-8333-333333333333',
        currentParticipants: 10,
        resources: 4,
        openQuestions: 2,
        contributionEvents: 7,
      },
    ],
    subjectsTruncated: false,
    ...overrides,
  };
}

describe('PilotService', () => {
  it('composes the contextual home from existing authorities and records activity', async () => {
    const pilotStore = store();
    const dependencies = deps();

    dependencies.profiles.getOwnerProfile.mockResolvedValue({
      profile: { id: 'profile-1' },
      onboardingRequired: false,
    });
    dependencies.academic.getCurrentContext.mockResolvedValue({
      context: { affiliationId: 'aff-1' },
    });
    dependencies.academic.listSubjectParticipations.mockResolvedValue({
      participations: [
        { subjectId: 'subject-b', state: 'current' },
        { subjectId: 'subject-a', state: 'current' },
        { subjectId: 'subject-a', state: 'current' },
        { subjectId: 'subject-c', state: 'completed' },
      ],
    });
    dependencies.feeds.academicFeed.mockResolvedValue({
      items: [{ id: 'academic-1' }],
      nextCursor: null,
      stopReason: 'end',
    });
    dependencies.feeds.forYou.mockResolvedValue({
      items: [{ id: 'for-you-1' }],
      nextCursor: null,
      stopReason: 'end',
    });
    dependencies.notifications.countUnread.mockResolvedValue({
      unreadCount: 3,
    });

    const result = await service(pilotStore, dependencies).home('user-1');

    expect(result.profileReady).toBe(true);
    expect(result.academic.currentSubjectIds).toEqual([
      'subject-a',
      'subject-b',
    ]);
    expect(result.notifications).toEqual({ unreadCount: 3 });
    expect(dependencies.feeds.academicFeed).toHaveBeenCalledWith('user-1', {
      limit: 6,
    });
    expect(dependencies.feeds.forYou).toHaveBeenCalledWith('user-1', {
      limit: 6,
      mode: 'balanced',
      order: 'ranked',
    });
    expect(dependencies.events.recordBestEffort).toHaveBeenCalledWith({
      event: 'pilot.home_viewed',
      userId: 'user-1',
    });
  });

  it('marks home profile readiness false when onboarding is incomplete', async () => {
    const pilotStore = store();
    const dependencies = deps();

    dependencies.profiles.getOwnerProfile.mockResolvedValue({
      profile: null,
      onboardingRequired: true,
    });
    dependencies.academic.getCurrentContext.mockResolvedValue({
      context: null,
    });
    dependencies.academic.listSubjectParticipations.mockResolvedValue({
      participations: [],
    });
    dependencies.feeds.academicFeed.mockResolvedValue({
      items: [],
      nextCursor: null,
      stopReason: 'empty',
    });
    dependencies.feeds.forYou.mockResolvedValue({
      items: [],
      nextCursor: null,
      stopReason: 'empty',
    });
    dependencies.notifications.countUnread.mockResolvedValue({
      unreadCount: 0,
    });

    await expect(
      service(pilotStore, dependencies).home('user-1'),
    ).resolves.toMatchObject({
      profileReady: false,
      academic: { currentSubjectIds: [] },
      notifications: { unreadCount: 0 },
    });
  });

  it('projects moderation queue timestamps without leaking store objects', async () => {
    const pilotStore = store();
    const dependencies = deps();
    pilotStore.listModeration.mockResolvedValue([
      moderation({
        status: 'resolved',
        reviewedAt: now,
        reviewedByUserId: 'operator-1',
        reviewReason: 'Confirmado',
        action: 'hide',
      }),
    ]);

    const result = await service(pilotStore, dependencies).listModeration(
      'resolved',
      20,
    );

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        status: 'resolved',
        reviewedAt: now.toISOString(),
        reviewedByUserId: 'operator-1',
        reviewReason: 'Confirmado',
        action: 'hide',
      }),
    );
    expect(pilotStore.listModeration.mock.calls[0]?.[0]).toEqual({
      status: 'resolved',
      limit: 20,
    });
  });

  it('reviews moderation with a normalized reason', async () => {
    const pilotStore = store();
    const dependencies = deps();
    pilotStore.reviewModeration.mockResolvedValue(
      moderation({
        status: 'dismissed',
        action: 'dismiss',
        reviewedAt: now,
      }),
    );

    const result = await service(pilotStore, dependencies).reviewModeration(
      'operator-1',
      'resource',
      '11111111-1111-4111-8111-111111111111',
      {
        action: 'dismiss',
        reason: '  No   corresponde  ',
      },
    );

    expect(result.item.status).toBe('dismissed');
    expect(pilotStore.reviewModeration.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        kind: 'resource',
        operatorUserId: 'operator-1',
        action: 'dismiss',
        reason: 'No corresponde',
      }),
    );
  });

  it.each([
    [
      new PilotReportNotFoundError(),
      NotFoundException,
      'PILOT_REPORT_NOT_FOUND',
    ],
    [
      new PilotModerationTargetNotFoundError(),
      NotFoundException,
      'PILOT_MODERATION_TARGET_NOT_FOUND',
    ],
    [
      new PilotReportAlreadyReviewedError(),
      ConflictException,
      'PILOT_REPORT_ALREADY_REVIEWED',
    ],
  ] as const)(
    'maps moderation persistence error %# to the stable HTTP contract',
    async (storeError, expectedType, expectedCode) => {
      const pilotStore = store();
      const dependencies = deps();
      pilotStore.reviewModeration.mockRejectedValue(storeError);

      try {
        await service(pilotStore, dependencies).reviewModeration(
          'operator-1',
          'qa',
          '11111111-1111-4111-8111-111111111111',
          { action: 'hide', reason: 'Razón válida' },
        );
        throw new Error('Expected moderation failure');
      } catch (error) {
        expect(error).toBeInstanceOf(expectedType);
        if (
          !(error instanceof NotFoundException) &&
          !(error instanceof ConflictException)
        ) {
          throw error;
        }
        expect(error.getResponse()).toEqual(
          expect.objectContaining({ code: expectedCode }),
        );
      }
    },
  );

  it('rethrows unexpected moderation persistence errors', async () => {
    const pilotStore = store();
    const dependencies = deps();
    const unexpected = new Error('mongo unavailable');
    pilotStore.reviewModeration.mockRejectedValue(unexpected);

    await expect(
      service(pilotStore, dependencies).reviewModeration(
        'operator-1',
        'resource',
        '11111111-1111-4111-8111-111111111111',
        { action: 'hide', reason: 'Razón válida' },
      ),
    ).rejects.toBe(unexpected);
  });

  it('calculates explicit pilot rates and enriches canonical subjects', async () => {
    const pilotStore = store();
    const dependencies = deps();
    pilotStore.metrics.mockResolvedValue(metrics());
    dependencies.academic.getCatalogNode.mockResolvedValue({
      node: { name: 'Base de Datos' },
    });

    const result = await service(pilotStore, dependencies).metrics(14, now);

    expect(result.onboarding.completionRate).toBe(80);
    expect(result.search.noResultRate).toBe(25);
    expect(result.activity.returningRate).toBe(50);
    expect(result.contributions.contributionRate).toBe(75);
    expect(result.moderation.oldestPendingAt).toBe('2026-09-20T18:00:00.000Z');
    expect(result.subjects[0]?.subjectName).toBe('Base de Datos');
    expect(pilotStore.metrics.mock.calls[0]?.[0]).toEqual({
      from: new Date('2026-09-09T18:00:00.000Z'),
      to: now,
      previousFrom: new Date('2026-08-26T18:00:00.000Z'),
      previousTo: new Date('2026-09-09T18:00:00.000Z'),
      days: 14,
    });
  });

  it('uses zero rates and null subject names when the denominator/catalog is absent', async () => {
    const pilotStore = store();
    const dependencies = deps();
    pilotStore.metrics.mockResolvedValue(
      metrics({
        onboarding: {
          accountsCreated: 0,
          profilesCompleted: 0,
          dropOff: 0,
        },
        search: {
          searches: 0,
          noResultSearches: 0,
        },
        activity: {
          activeUsers: 0,
          returningUsers: 0,
        },
        contributions: {
          events: 0,
          contributors: 0,
        },
        moderation: {
          pending: 0,
          reviewedInWindow: 0,
          oldestPendingAt: null,
        },
      }),
    );
    dependencies.academic.getCatalogNode.mockRejectedValue(
      new Error('catalog unavailable'),
    );

    const result = await service(pilotStore, dependencies).metrics(14, now);

    expect(result.onboarding.completionRate).toBe(0);
    expect(result.search.noResultRate).toBe(0);
    expect(result.activity.returningRate).toBe(0);
    expect(result.contributions.contributionRate).toBe(0);
    expect(result.moderation.oldestPendingAt).toBeNull();
    expect(result.subjects[0]?.subjectName).toBeNull();
  });

  it.each([0, 91, 1.5])(
    'rejects an invalid metrics window: %s',
    async (days) => {
      const pilotStore = store();
      const dependencies = deps();

      await expect(
        service(pilotStore, dependencies).metrics(days, now),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(pilotStore.metrics.mock.calls).toHaveLength(0);
    },
  );
});
