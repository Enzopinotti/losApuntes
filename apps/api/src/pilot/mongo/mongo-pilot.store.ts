import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import type { Connection, Model } from 'mongoose';

import {
  PilotModerationTargetNotFoundError,
  PilotReportAlreadyReviewedError,
  PilotReportNotFoundError,
  type PilotMetricsSnapshot,
  type PilotStore,
} from '../domain/pilot.store';
import type {
  PilotModerationAction,
  PilotModerationQueueItem,
  PilotReportKind,
  PilotReportStatus,
  PilotSubjectDensity,
} from '../domain/pilot.types';
import { PilotModerationAudit } from './pilot.mongo-schemas';

type ReportDocument = {
  id: string;
  reporterUserId: string;
  reason: string;
  details: string | null;
  status: PilotReportStatus;
  createdAt: Date;
  updatedAt: Date;
  reviewedByUserId?: string;
  reviewedAt?: Date;
  reviewReason?: string;
  reviewAction?: PilotModerationAction;
};

type ResourceReportDocument = ReportDocument & {
  resourceId: string;
};

type QaReportDocument = ReportDocument & {
  targetType: 'question' | 'answer';
  targetId: string;
};

type OrganizationReportDocument = ReportDocument & {
  targetType: 'organization_post' | 'organization_event';
  targetId: string;
};

type ModeratedTarget = {
  id: string;
  title?: string;
  body?: string;
  description?: string | null;
  moderationState: 'available' | 'hidden';
};

type PilotEventDocument = {
  event: string;
  userId?: string;
  subjectId?: string;
  resultCount?: number;
  createdAt: Date;
};

function preview(value: string | null | undefined): string {
  if (!value) return '';
  const clean = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return clean.length <= 240 ? clean : clean.slice(0, 239) + '…';
}

@Injectable()
export class MongoPilotStore implements PilotStore {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(PilotModerationAudit.name)
    private readonly audits: Model<PilotModerationAudit>,
  ) {}

  async listModeration(input: {
    status: PilotReportStatus;
    limit: number;
  }): Promise<PilotModerationQueueItem[]> {
    const resourceReports = await this.connection
      .collection<ResourceReportDocument>('resource_reports')
      .find({ status: input.status })
      .sort({ createdAt: 1, id: 1 })
      .limit(input.limit)
      .toArray();
    const qaReports = await this.connection
      .collection<QaReportDocument>('qa_reports')
      .find({ status: input.status })
      .sort({ createdAt: 1, id: 1 })
      .limit(input.limit)
      .toArray();
    const organizationReports = await this.connection
      .collection<OrganizationReportDocument>('organization_reports')
      .find({ status: input.status })
      .sort({ createdAt: 1, id: 1 })
      .limit(input.limit)
      .toArray();

    const rows = [
      ...resourceReports.map((report) => ({
        kind: 'resource' as const,
        report,
      })),
      ...qaReports.map((report) => ({ kind: 'qa' as const, report })),
      ...organizationReports.map((report) => ({
        kind: 'organization' as const,
        report,
      })),
    ]
      .sort(
        (left, right) =>
          left.report.createdAt.getTime() - right.report.createdAt.getTime() ||
          left.report.id.localeCompare(right.report.id),
      )
      .slice(0, input.limit);

    return Promise.all(
      rows.map(({ kind, report }) => this.queueItem(kind, report)),
    );
  }

  async reviewModeration(input: {
    kind: PilotReportKind;
    reportId: string;
    operatorUserId: string;
    action: PilotModerationAction;
    reason: string;
    now: Date;
  }): Promise<PilotModerationQueueItem> {
    const session = await this.connection.startSession();
    let reviewed:
      | {
          kind: PilotReportKind;
          report:
            | ResourceReportDocument
            | QaReportDocument
            | OrganizationReportDocument;
        }
      | undefined;

    try {
      await session.withTransaction(async () => {
        const reportCollection =
          input.kind === 'resource'
            ? this.connection.collection<ResourceReportDocument>(
                'resource_reports',
              )
            : input.kind === 'qa'
              ? this.connection.collection<QaReportDocument>('qa_reports')
              : this.connection.collection<OrganizationReportDocument>(
                  'organization_reports',
                );
        const existing = await reportCollection.findOne(
          { id: input.reportId },
          { session },
        );

        if (!existing) throw new PilotReportNotFoundError();
        if (existing.status !== 'pending') {
          throw new PilotReportAlreadyReviewedError();
        }

        const target = this.targetIdentity(input.kind, existing);
        const targetCollection =
          target.kind === 'resource'
            ? this.connection.collection<ModeratedTarget>('resources')
            : target.kind === 'question'
              ? this.connection.collection<ModeratedTarget>('questions')
              : target.kind === 'answer'
                ? this.connection.collection<ModeratedTarget>('answers')
                : target.kind === 'organization_post'
                  ? this.connection.collection<ModeratedTarget>(
                      'organization_posts',
                    )
                  : this.connection.collection<ModeratedTarget>(
                      'organization_events',
                    );
        const currentTarget = await targetCollection.findOne(
          { id: target.id },
          { session },
        );

        if (!currentTarget) throw new PilotModerationTargetNotFoundError();

        if (input.action !== 'dismiss') {
          const moderationState =
            input.action === 'hide' ? 'hidden' : 'available';
          const targetUpdate = await targetCollection.updateOne(
            { id: target.id },
            {
              $set: {
                moderationState,
                updatedAt: input.now,
              },
            },
            { session },
          );

          if (targetUpdate.matchedCount !== 1) {
            throw new PilotModerationTargetNotFoundError();
          }
        }

        const nextStatus: PilotReportStatus =
          input.action === 'dismiss' ? 'dismissed' : 'resolved';
        const reportUpdate = await reportCollection.updateOne(
          { id: input.reportId, status: 'pending' },
          {
            $set: {
              status: nextStatus,
              reviewedByUserId: input.operatorUserId,
              reviewedAt: input.now,
              reviewReason: input.reason,
              reviewAction: input.action,
              updatedAt: input.now,
            },
          },
          { session },
        );

        if (reportUpdate.modifiedCount !== 1) {
          throw new PilotReportAlreadyReviewedError();
        }

        await this.audits.create(
          [
            {
              id: randomUUID(),
              operatorUserId: input.operatorUserId,
              reportKind: input.kind,
              reportId: input.reportId,
              targetKind: target.kind,
              targetId: target.id,
              action: input.action,
              reason: input.reason,
              createdAt: input.now,
            },
          ],
          { session },
        );

        reviewed = {
          kind: input.kind,
          report: {
            ...existing,
            status: nextStatus,
            reviewedByUserId: input.operatorUserId,
            reviewedAt: input.now,
            reviewReason: input.reason,
            reviewAction: input.action,
            updatedAt: input.now,
          },
        };
      });
    } finally {
      await session.endSession();
    }

    if (!reviewed) {
      throw new PilotReportAlreadyReviewedError();
    }

    return this.queueItem(reviewed.kind, reviewed.report);
  }

  async metrics(input: {
    from: Date;
    to: Date;
    previousFrom: Date;
    previousTo: Date;
    days: number;
  }): Promise<PilotMetricsSnapshot> {
    const users = this.connection.collection('users');
    const events =
      this.connection.collection<PilotEventDocument>('pilot_events');
    const resourceReports = this.connection.collection('resource_reports');
    const qaReports = this.connection.collection('qa_reports');
    const organizationReports = this.connection.collection(
      'organization_reports',
    );

    const onboardingRows = await users
      .aggregate<{ accountsCreated: number; profilesCompleted: number }>([
        { $match: { createdAt: { $gte: input.from, $lt: input.to } } },
        { $project: { userId: { $toString: '$_id' } } },
        {
          $lookup: {
            from: 'profiles',
            localField: 'userId',
            foreignField: 'userId',
            as: '__profile',
          },
        },
        {
          $group: {
            _id: null,
            accountsCreated: { $sum: 1 },
            profilesCompleted: {
              $sum: {
                $cond: [{ $gt: [{ $size: '$__profile' }, 0] }, 1, 0],
              },
            },
          },
        },
      ])
      .toArray();
    const onboarding = onboardingRows[0] ?? {
      accountsCreated: 0,
      profilesCompleted: 0,
    };

    const [
      searches,
      noResultSearches,
      currentUsers,
      previousUsers,
      contributionEvents,
      contributorIds,
      resourcePending,
      qaPending,
      organizationPending,
      resourceReviewed,
      qaReviewed,
      organizationReviewed,
      oldestResource,
      oldestQa,
      oldestOrganization,
      participantRows,
      resourceRows,
      questionRows,
      contributionRows,
    ] = await Promise.all([
      events.countDocuments({
        event: 'pilot.search_performed',
        createdAt: { $gte: input.from, $lt: input.to },
      }),
      events.countDocuments({
        event: 'pilot.search_performed',
        resultCount: 0,
        createdAt: { $gte: input.from, $lt: input.to },
      }),
      events.distinct('userId', {
        userId: { $type: 'string' },
        createdAt: { $gte: input.from, $lt: input.to },
      }),
      events.distinct('userId', {
        userId: { $type: 'string' },
        createdAt: { $gte: input.previousFrom, $lt: input.previousTo },
      }),
      events.countDocuments({
        event: {
          $in: [
            'pilot.resource_created',
            'pilot.question_created',
            'pilot.answer_created',
          ],
        },
        createdAt: { $gte: input.from, $lt: input.to },
      }),
      events.distinct('userId', {
        userId: { $type: 'string' },
        event: {
          $in: [
            'pilot.resource_created',
            'pilot.question_created',
            'pilot.answer_created',
          ],
        },
        createdAt: { $gte: input.from, $lt: input.to },
      }),
      resourceReports.countDocuments({ status: 'pending' }),
      qaReports.countDocuments({ status: 'pending' }),
      organizationReports.countDocuments({ status: 'pending' }),
      resourceReports.countDocuments({
        reviewedAt: { $gte: input.from, $lt: input.to },
      }),
      qaReports.countDocuments({
        reviewedAt: { $gte: input.from, $lt: input.to },
      }),
      organizationReports.countDocuments({
        reviewedAt: { $gte: input.from, $lt: input.to },
      }),
      resourceReports.findOne(
        { status: 'pending' },
        { sort: { createdAt: 1 }, projection: { createdAt: 1 } },
      ),
      qaReports.findOne(
        { status: 'pending' },
        { sort: { createdAt: 1 }, projection: { createdAt: 1 } },
      ),
      organizationReports.findOne(
        { status: 'pending' },
        { sort: { createdAt: 1 }, projection: { createdAt: 1 } },
      ),
      this.countBySubject(
        'academic_subject_participations',
        { state: 'current' },
        'subjectId',
      ),
      this.countBySubject(
        'resources',
        { moderationState: 'available' },
        'subjectId',
      ),
      this.countBySubject(
        'questions',
        { moderationState: 'available', state: 'open' },
        'subjectId',
      ),
      events
        .aggregate<{ _id: string; count: number }>([
          {
            $match: {
              subjectId: { $type: 'string' },
              event: {
                $in: [
                  'pilot.resource_created',
                  'pilot.question_created',
                  'pilot.answer_created',
                ],
              },
              createdAt: { $gte: input.from, $lt: input.to },
            },
          },
          { $group: { _id: '$subjectId', count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const definedCurrentUsers = currentUsers.filter(
      (userId): userId is string => typeof userId === 'string',
    );
    const definedPreviousUsers = previousUsers.filter(
      (userId): userId is string => typeof userId === 'string',
    );
    const cohortUserIds = [
      ...new Set([...definedCurrentUsers, ...definedPreviousUsers]),
    ];
    const affiliationRows =
      cohortUserIds.length === 0
        ? []
        : await this.connection
            .collection<{ userId: string; status: string }>(
              'academic_affiliations',
            )
            .find({
              userId: { $in: cohortUserIds },
              status: { $in: ['active', 'paused', 'completed', 'alumni'] },
            })
            .project<{ userId: string; status: string }>({
              _id: 0,
              userId: 1,
              status: 1,
            })
            .toArray();
    const statusesByUser = new Map<string, Set<string>>();

    for (const row of affiliationRows) {
      const statuses = statusesByUser.get(row.userId) ?? new Set<string>();
      statuses.add(row.status);
      statusesByUser.set(row.userId, statuses);
    }

    const cohort = (
      userId: string,
    ): 'activeStudent' | 'alumni' | 'community' => {
      const statuses = statusesByUser.get(userId);
      if (statuses?.has('active') || statuses?.has('paused')) {
        return 'activeStudent';
      }
      if (statuses?.has('alumni') || statuses?.has('completed')) {
        return 'alumni';
      }
      return 'community';
    };

    const previousSet = new Set(definedPreviousUsers);
    const returningUsers = definedCurrentUsers.filter((id) =>
      previousSet.has(id),
    );
    const audience = {
      activeStudents: { activeUsers: 0, returningUsers: 0 },
      alumni: { activeUsers: 0, returningUsers: 0 },
      community: { activeUsers: 0, returningUsers: 0 },
    };

    for (const userId of definedCurrentUsers) {
      const key = cohort(userId);
      if (key === 'activeStudent') {
        audience.activeStudents.activeUsers += 1;
        if (previousSet.has(userId))
          audience.activeStudents.returningUsers += 1;
      } else if (key === 'alumni') {
        audience.alumni.activeUsers += 1;
        if (previousSet.has(userId)) audience.alumni.returningUsers += 1;
      } else {
        audience.community.activeUsers += 1;
        if (previousSet.has(userId)) audience.community.returningUsers += 1;
      }
    }

    const subjectMap = new Map<string, PilotSubjectDensity>();

    const ensure = (subjectId: string): PilotSubjectDensity => {
      const existing = subjectMap.get(subjectId);
      if (existing) return existing;
      const created = {
        subjectId,
        currentParticipants: 0,
        resources: 0,
        openQuestions: 0,
        contributionEvents: 0,
      };
      subjectMap.set(subjectId, created);
      return created;
    };

    participantRows.forEach((row) => {
      ensure(row._id).currentParticipants = row.count;
    });
    resourceRows.forEach((row) => {
      ensure(row._id).resources = row.count;
    });
    questionRows.forEach((row) => {
      ensure(row._id).openQuestions = row.count;
    });
    contributionRows.forEach((row) => {
      ensure(row._id).contributionEvents = row.count;
    });

    const allSubjects = [...subjectMap.values()].sort(
      (left, right) =>
        right.contributionEvents - left.contributionEvents ||
        right.currentParticipants - left.currentParticipants ||
        right.resources - left.resources ||
        right.openQuestions - left.openQuestions ||
        left.subjectId.localeCompare(right.subjectId),
    );
    const oldestPendingAt =
      [
        oldestResource?.createdAt as Date | undefined,
        oldestQa?.createdAt as Date | undefined,
        oldestOrganization?.createdAt as Date | undefined,
      ]
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;

    return {
      window: {
        from: input.from,
        to: input.to,
        days: input.days,
      },
      onboarding: {
        accountsCreated: onboarding.accountsCreated,
        profilesCompleted: onboarding.profilesCompleted,
        dropOff: onboarding.accountsCreated - onboarding.profilesCompleted,
      },
      search: {
        searches,
        noResultSearches,
      },
      activity: {
        activeUsers: definedCurrentUsers.length,
        returningUsers: returningUsers.length,
      },
      audience,
      contributions: {
        events: contributionEvents,
        contributors: contributorIds.length,
      },
      moderation: {
        pending: resourcePending + qaPending + organizationPending,
        reviewedInWindow: resourceReviewed + qaReviewed + organizationReviewed,
        oldestPendingAt,
      },
      subjects: allSubjects.slice(0, 100),
      subjectsTruncated: allSubjects.length > 100,
    };
  }

  private async queueItem(
    kind: PilotReportKind,
    report:
      ResourceReportDocument | QaReportDocument | OrganizationReportDocument,
  ): Promise<PilotModerationQueueItem> {
    const target = this.targetIdentity(kind, report);
    const targetCollection =
      target.kind === 'resource'
        ? this.connection.collection<ModeratedTarget>('resources')
        : target.kind === 'question'
          ? this.connection.collection<ModeratedTarget>('questions')
          : target.kind === 'answer'
            ? this.connection.collection<ModeratedTarget>('answers')
            : target.kind === 'organization_post'
              ? this.connection.collection<ModeratedTarget>(
                  'organization_posts',
                )
              : this.connection.collection<ModeratedTarget>(
                  'organization_events',
                );
    const row = await targetCollection.findOne({ id: target.id });

    return {
      kind,
      reportId: report.id,
      targetKind: target.kind,
      targetId: target.id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      reporterUserId: report.reporterUserId,
      createdAt: report.createdAt,
      ...(report.reviewedAt ? { reviewedAt: report.reviewedAt } : {}),
      ...(report.reviewedByUserId
        ? { reviewedByUserId: report.reviewedByUserId }
        : {}),
      ...(report.reviewReason ? { reviewReason: report.reviewReason } : {}),
      ...(report.reviewAction ? { action: report.reviewAction } : {}),
      target: {
        title:
          row?.title ??
          (target.kind === 'answer'
            ? 'Respuesta'
            : target.kind === 'organization_event'
              ? 'Evento'
              : 'Contenido no disponible'),
        preview: preview(row?.description ?? row?.body),
        moderationState: row?.moderationState ?? 'hidden',
      },
    };
  }

  private targetIdentity(
    kind: PilotReportKind,
    report:
      ResourceReportDocument | QaReportDocument | OrganizationReportDocument,
  ): {
    kind:
      | 'resource'
      | 'question'
      | 'answer'
      | 'organization_post'
      | 'organization_event';
    id: string;
  } {
    if (kind === 'resource') {
      const resource = report as ResourceReportDocument;
      return { kind: 'resource', id: resource.resourceId };
    }

    if (kind === 'qa') {
      const qa = report as QaReportDocument;
      return { kind: qa.targetType, id: qa.targetId };
    }

    const organization = report as OrganizationReportDocument;
    return { kind: organization.targetType, id: organization.targetId };
  }

  private async countBySubject(
    collectionName: string,
    match: Record<string, unknown>,
    field: string,
  ): Promise<Array<{ _id: string; count: number }>> {
    return this.connection
      .collection(collectionName)
      .aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $group: { _id: '$' + field, count: { $sum: 1 } } },
        { $match: { _id: { $type: 'string' } } },
      ])
      .toArray();
  }
}
