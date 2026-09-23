import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AcademicService } from '../../academic/domain/academic.service';
import { FeedService } from '../../feeds/domain/feed.service';
import { NotificationService } from '../../notifications/domain/notification.service';
import { ProfileService } from '../../profile/domain/profile.service';
import type { ReviewPilotModerationDto } from '../dto/pilot.dto';
import { PilotEventService } from '../telemetry/pilot-event.service';
import {
  PILOT_STORE,
  PilotModerationTargetNotFoundError,
  PilotReportAlreadyReviewedError,
  PilotReportNotFoundError,
  type PilotStore,
} from './pilot.store';
import type {
  PilotModerationQueueItem,
  PilotReportKind,
  PilotReportStatus,
} from './pilot.types';

const DAY_MS = 24 * 60 * 60 * 1000;

function percentage(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 10_000) / 100;
}

function cleanReason(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

@Injectable()
export class PilotService {
  constructor(
    @Inject(PILOT_STORE)
    private readonly store: PilotStore,
    private readonly academic: AcademicService,
    private readonly profiles: ProfileService,
    private readonly feeds: FeedService,
    private readonly notifications: NotificationService,
    private readonly events: PilotEventService,
  ) {}

  async home(userId: string) {
    const [
      profile,
      currentContext,
      participations,
      academicFeed,
      forYou,
      notifications,
    ] = await Promise.all([
      this.profiles.getOwnerProfile(userId),
      this.academic.getCurrentContext(userId),
      this.academic.listSubjectParticipations(userId),
      this.feeds.academicFeed(userId, { limit: 6 }),
      this.feeds.forYou(userId, {
        limit: 6,
        mode: 'balanced',
        order: 'ranked',
      }),
      this.notifications.countUnread(userId),
    ]);

    const currentSubjectIds = [
      ...new Set(
        participations.participations
          .filter((row) => row.state === 'current')
          .map((row) => row.subjectId),
      ),
    ].sort();

    await this.events.recordBestEffort({
      event: 'pilot.home_viewed',
      userId,
    });

    return {
      profileReady: !profile.onboardingRequired,
      academic: {
        currentContext: currentContext.context,
        currentSubjectIds,
      },
      academicFeed,
      forYou,
      notifications,
    };
  }

  async listModeration(status: PilotReportStatus, limit: number) {
    const rows = await this.store.listModeration({ status, limit });
    return {
      items: rows.map((row) => this.moderationProjection(row)),
    };
  }

  async reviewModeration(
    operatorUserId: string,
    kind: PilotReportKind,
    reportId: string,
    dto: ReviewPilotModerationDto,
  ) {
    try {
      const reviewed = await this.store.reviewModeration({
        kind,
        reportId,
        operatorUserId,
        action: dto.action,
        reason: cleanReason(dto.reason),
        now: new Date(),
      });

      return { item: this.moderationProjection(reviewed) };
    } catch (error) {
      if (error instanceof PilotReportNotFoundError) {
        throw new NotFoundException({
          code: 'PILOT_REPORT_NOT_FOUND',
          message: 'Moderation report was not found',
        });
      }
      if (error instanceof PilotModerationTargetNotFoundError) {
        throw new NotFoundException({
          code: 'PILOT_MODERATION_TARGET_NOT_FOUND',
          message: 'Moderation target was not found',
        });
      }
      if (error instanceof PilotReportAlreadyReviewedError) {
        throw new ConflictException({
          code: 'PILOT_REPORT_ALREADY_REVIEWED',
          message: 'Moderation report has already been reviewed',
        });
      }
      throw error;
    }
  }

  async metrics(days: number, now = new Date()) {
    if (!Number.isSafeInteger(days) || days < 1 || days > 90) {
      throw new UnprocessableEntityException({
        code: 'PILOT_METRICS_WINDOW_INVALID',
        message: 'Pilot metrics window must be between 1 and 90 days',
      });
    }

    const to = now;
    const from = new Date(to.getTime() - days * DAY_MS);
    const previousTo = from;
    const previousFrom = new Date(previousTo.getTime() - days * DAY_MS);
    const snapshot = await this.store.metrics({
      from,
      to,
      previousFrom,
      previousTo,
      days,
    });

    const subjects = await Promise.all(
      snapshot.subjects.map(async (row) => {
        try {
          const subject = await this.academic.getCatalogNode(row.subjectId);
          return {
            ...row,
            subjectName: subject.node.name,
          };
        } catch {
          return {
            ...row,
            subjectName: null,
          };
        }
      }),
    );

    return {
      window: {
        from: snapshot.window.from.toISOString(),
        to: snapshot.window.to.toISOString(),
        days: snapshot.window.days,
      },
      onboarding: {
        ...snapshot.onboarding,
        completionRate: percentage(
          snapshot.onboarding.profilesCompleted,
          snapshot.onboarding.accountsCreated,
        ),
      },
      search: {
        ...snapshot.search,
        noResultRate: percentage(
          snapshot.search.noResultSearches,
          snapshot.search.searches,
        ),
      },
      activity: {
        ...snapshot.activity,
        returningRate: percentage(
          snapshot.activity.returningUsers,
          snapshot.activity.activeUsers,
        ),
      },
      contributions: {
        ...snapshot.contributions,
        contributionRate: percentage(
          snapshot.contributions.contributors,
          snapshot.activity.activeUsers,
        ),
      },
      moderation: {
        ...snapshot.moderation,
        oldestPendingAt:
          snapshot.moderation.oldestPendingAt?.toISOString() ?? null,
      },
      subjects,
      subjectsTruncated: snapshot.subjectsTruncated,
    };
  }

  private moderationProjection(row: PilotModerationQueueItem) {
    return {
      kind: row.kind,
      reportId: row.reportId,
      targetKind: row.targetKind,
      targetId: row.targetId,
      reason: row.reason,
      details: row.details,
      status: row.status,
      reporterUserId: row.reporterUserId,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewedByUserId: row.reviewedByUserId ?? null,
      reviewReason: row.reviewReason ?? null,
      action: row.action ?? null,
      target: row.target,
    };
  }
}
