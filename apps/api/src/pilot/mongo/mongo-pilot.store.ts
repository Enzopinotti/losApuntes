import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import type { Connection, Model } from 'mongoose';

import {
  PILOT_SUBJECT_METRICS_LIMIT,
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

type PilotMetricsQuery = {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  days: number;
};

type PilotAudienceAggregationRow = {
  _id: 'activeStudent' | 'alumni' | 'community';
  activeUsers: number;
  returningUsers: number;
};

type PilotCountAggregationRow = {
  count: number;
};

type PilotSubjectAggregationRow = {
  _id: string;
  currentParticipants: number;
  resources: number;
  openQuestions: number;
  contributionEvents: number;
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

  async metrics(input: PilotMetricsQuery): Promise<PilotMetricsSnapshot> {
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
      activityAudience,
      contributionEvents,
      contributorCount,
      resourcePending,
      qaPending,
      organizationPending,
      resourceReviewed,
      qaReviewed,
      organizationReviewed,
      oldestResource,
      oldestQa,
      oldestOrganization,
      subjectMetrics,
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
      this.audienceMetrics(input),
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
      this.countContributors(input),
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
      this.subjectMetrics(input),
    ]);

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
      activity: activityAudience.activity,
      audience: activityAudience.audience,
      contributions: {
        events: contributionEvents,
        contributors: contributorCount,
      },
      moderation: {
        pending: resourcePending + qaPending + organizationPending,
        reviewedInWindow: resourceReviewed + qaReviewed + organizationReviewed,
        oldestPendingAt,
      },
      subjects: subjectMetrics.subjects,
      subjectsTruncated: subjectMetrics.subjectsTruncated,
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

  private async audienceMetrics(
    input: PilotMetricsQuery,
  ): Promise<Pick<PilotMetricsSnapshot, 'activity' | 'audience'>> {
    const rows = await this.connection
      .collection<PilotEventDocument>('pilot_events')
      .aggregate<PilotAudienceAggregationRow>([
        {
          $match: {
            userId: { $type: 'string' },
            createdAt: { $gte: input.previousFrom, $lt: input.to },
          },
        },
        {
          $group: {
            _id: '$userId',
            current: {
              $max: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$createdAt', input.from] },
                      { $lt: ['$createdAt', input.to] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            previous: {
              $max: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$createdAt', input.previousFrom] },
                      { $lt: ['$createdAt', input.previousTo] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $match: { current: 1 } },
        {
          $lookup: {
            from: 'academic_affiliations',
            let: { userId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$userId', '$$userId'] },
                  status: {
                    $in: ['active', 'paused', 'completed', 'alumni'],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  statuses: { $addToSet: '$status' },
                },
              },
            ],
            as: '__affiliations',
          },
        },
        {
          $set: {
            __statuses: {
              $ifNull: [
                { $arrayElemAt: ['$__affiliations.statuses', 0] },
                [],
              ],
            },
          },
        },
        {
          $set: {
            __cohort: {
              $switch: {
                branches: [
                  {
                    case: {
                      $gt: [
                        {
                          $size: {
                            $setIntersection: [
                              '$__statuses',
                              ['active', 'paused'],
                            ],
                          },
                        },
                        0,
                      ],
                    },
                    then: 'activeStudent',
                  },
                  {
                    case: {
                      $gt: [
                        {
                          $size: {
                            $setIntersection: [
                              '$__statuses',
                              ['alumni', 'completed'],
                            ],
                          },
                        },
                        0,
                      ],
                    },
                    then: 'alumni',
                  },
                ],
                default: 'community',
              },
            },
          },
        },
        {
          $group: {
            _id: '$__cohort',
            activeUsers: { $sum: 1 },
            returningUsers: { $sum: '$previous' },
          },
        },
      ])
      .toArray();

    const result: Pick<PilotMetricsSnapshot, 'activity' | 'audience'> = {
      activity: { activeUsers: 0, returningUsers: 0 },
      audience: {
        activeStudents: { activeUsers: 0, returningUsers: 0 },
        alumni: { activeUsers: 0, returningUsers: 0 },
        community: { activeUsers: 0, returningUsers: 0 },
      },
    };

    for (const row of rows) {
      result.activity.activeUsers += row.activeUsers;
      result.activity.returningUsers += row.returningUsers;

      if (row._id === 'activeStudent') {
        result.audience.activeStudents = {
          activeUsers: row.activeUsers,
          returningUsers: row.returningUsers,
        };
      } else if (row._id === 'alumni') {
        result.audience.alumni = {
          activeUsers: row.activeUsers,
          returningUsers: row.returningUsers,
        };
      } else {
        result.audience.community = {
          activeUsers: row.activeUsers,
          returningUsers: row.returningUsers,
        };
      }
    }

    return result;
  }

  private async countContributors(input: PilotMetricsQuery): Promise<number> {
    const rows = await this.connection
      .collection<PilotEventDocument>('pilot_events')
      .aggregate<PilotCountAggregationRow>([
        {
          $match: {
            userId: { $type: 'string' },
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
        { $group: { _id: '$userId' } },
        { $count: 'count' },
      ])
      .toArray();

    return rows[0]?.count ?? 0;
  }

  private async subjectMetrics(input: PilotMetricsQuery): Promise<{
    subjects: PilotSubjectDensity[];
    subjectsTruncated: boolean;
  }> {
    const rows = await this.connection
      .collection('academic_subject_participations')
      .aggregate<PilotSubjectAggregationRow>([
        {
          $match: {
            state: 'current',
            subjectId: { $type: 'string' },
          },
        },
        {
          $group: {
            _id: '$subjectId',
            currentParticipants: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 1,
            currentParticipants: 1,
            resources: { $literal: 0 },
            openQuestions: { $literal: 0 },
            contributionEvents: { $literal: 0 },
          },
        },
        {
          $unionWith: {
            coll: 'resources',
            pipeline: [
              {
                $match: {
                  moderationState: 'available',
                  subjectId: { $type: 'string' },
                },
              },
              { $group: { _id: '$subjectId', resources: { $sum: 1 } } },
              {
                $project: {
                  _id: 1,
                  currentParticipants: { $literal: 0 },
                  resources: 1,
                  openQuestions: { $literal: 0 },
                  contributionEvents: { $literal: 0 },
                },
              },
            ],
          },
        },
        {
          $unionWith: {
            coll: 'questions',
            pipeline: [
              {
                $match: {
                  moderationState: 'available',
                  state: 'open',
                  subjectId: { $type: 'string' },
                },
              },
              {
                $group: {
                  _id: '$subjectId',
                  openQuestions: { $sum: 1 },
                },
              },
              {
                $project: {
                  _id: 1,
                  currentParticipants: { $literal: 0 },
                  resources: { $literal: 0 },
                  openQuestions: 1,
                  contributionEvents: { $literal: 0 },
                },
              },
            ],
          },
        },
        {
          $unionWith: {
            coll: 'pilot_events',
            pipeline: [
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
              {
                $group: {
                  _id: '$subjectId',
                  contributionEvents: { $sum: 1 },
                },
              },
              {
                $project: {
                  _id: 1,
                  currentParticipants: { $literal: 0 },
                  resources: { $literal: 0 },
                  openQuestions: { $literal: 0 },
                  contributionEvents: 1,
                },
              },
            ],
          },
        },
        {
          $group: {
            _id: '$_id',
            currentParticipants: { $sum: '$currentParticipants' },
            resources: { $sum: '$resources' },
            openQuestions: { $sum: '$openQuestions' },
            contributionEvents: { $sum: '$contributionEvents' },
          },
        },
        {
          $sort: {
            contributionEvents: -1,
            currentParticipants: -1,
            resources: -1,
            openQuestions: -1,
            _id: 1,
          },
        },
        { $limit: PILOT_SUBJECT_METRICS_LIMIT + 1 },
      ])
      .toArray();

    return {
      subjects: rows.slice(0, PILOT_SUBJECT_METRICS_LIMIT).map((row) => ({
        subjectId: row._id,
        currentParticipants: row.currentParticipants,
        resources: row.resources,
        openQuestions: row.openQuestions,
        contributionEvents: row.contributionEvents,
      })),
      subjectsTruncated: rows.length > PILOT_SUBJECT_METRICS_LIMIT,
    };
  }

}
