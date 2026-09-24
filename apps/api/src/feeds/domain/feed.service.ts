import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AcademicService } from '../../academic/domain/academic.service';
import { OrganizationService } from '../../organizations/domain/organization.service';
import { ProfileService } from '../../profile/domain/profile.service';
import { QaService } from '../../qa/domain/qa.service';
import type { QuestionRecord } from '../../qa/domain/qa.types';
import { ResourceService } from '../../resources/domain/resource.service';
import type { ResourceRecord } from '../../resources/domain/resource.types';
import { SocialService } from '../../social/domain/social.service';
import type {
  FeedPageDto,
  ForYouFeedDto,
  UpdateFeedPreferencesDto,
} from '../dto/feed.dto';
import {
  compareChronological,
  compareRanked,
  rankFeedCandidate,
  takeAcademicPage,
  takeForYouPage,
  type FeedCandidate,
  type FeedRankingContext,
  type RankedFeedCandidate,
} from './feed-ranking';
import { FEED_STORE, type FeedStore } from './feed.store';
import type {
  FeedCursor,
  FeedFeedbackSignal,
  FeedMode,
  FeedOrder,
  FeedPreferencesRecord,
  FeedReasonCode,
  FeedTargetType,
} from './feed.types';

const CANDIDATE_LIMIT = 150;
const MAX_PAGES = 3;

type FeedKind = 'academic' | 'for_you';

type CandidateWithProjection = RankedFeedCandidate & {
  author: {
    profileId: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es-AR');
}

function excerpt(value: string | null, maximum = 240): string {
  if (!value) return '';
  const clean = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return clean.length <= maximum ? clean : clean.slice(0, maximum - 1) + '…';
}

function candidateKey(candidate: Pick<FeedCandidate, 'type' | 'id'>): string {
  return `${candidate.type}:${candidate.id}`;
}

function encodeCursor(
  cursor: FeedCursor & { feed: FeedKind; limit: number },
): string {
  return Buffer.from(
    JSON.stringify({
      feed: cursor.feed,
      anchorAt: cursor.anchorAt.toISOString(),
      revision: cursor.revision,
      page: cursor.page,
      offset: cursor.offset,
      mode: cursor.mode,
      order: cursor.order,
      limit: cursor.limit,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(
  raw: string | undefined,
): (FeedCursor & { feed: FeedKind; limit: number }) | undefined {
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    if (
      !['academic', 'for_you'].includes(String(parsed.feed)) ||
      typeof parsed.anchorAt !== 'string' ||
      typeof parsed.revision !== 'number' ||
      typeof parsed.page !== 'number' ||
      typeof parsed.offset !== 'number' ||
      !['balanced', 'study', 'discover', 'community'].includes(
        String(parsed.mode),
      ) ||
      !['ranked', 'chronological'].includes(String(parsed.order)) ||
      typeof parsed.limit !== 'number'
    ) {
      throw new Error('invalid cursor');
    }

    const anchorAt = new Date(parsed.anchorAt);
    if (
      Number.isNaN(anchorAt.getTime()) ||
      !Number.isSafeInteger(parsed.revision) ||
      parsed.revision < 1 ||
      !Number.isSafeInteger(parsed.page) ||
      parsed.page < 0 ||
      parsed.page >= MAX_PAGES ||
      !Number.isSafeInteger(parsed.offset) ||
      parsed.offset < 0 ||
      !Number.isSafeInteger(parsed.limit) ||
      parsed.limit < 1 ||
      parsed.limit > 25
    ) {
      throw new Error('invalid cursor values');
    }

    return {
      feed: parsed.feed as FeedKind,
      anchorAt,
      revision: parsed.revision,
      page: parsed.page,
      offset: parsed.offset,
      mode: parsed.mode as FeedMode,
      order: parsed.order as FeedOrder,
      limit: parsed.limit,
    };
  } catch {
    throw new UnprocessableEntityException({
      code: 'FEED_CURSOR_INVALID',
      message: 'Feed cursor is invalid',
    });
  }
}

@Injectable()
export class FeedService {
  constructor(
    @Inject(FEED_STORE)
    private readonly store: FeedStore,
    private readonly academic: AcademicService,
    private readonly profiles: ProfileService,
    private readonly resources: ResourceService,
    private readonly qa: QaService,
    private readonly social: SocialService,
    private readonly organizations: OrganizationService,
  ) {}

  async getPreferences(userId: string) {
    const [preferences, signals] = await Promise.all([
      this.store.getOrCreatePreferences(userId),
      this.profiles.getFeedSignals(userId),
    ]);

    return this.preferencesProjection(
      preferences,
      signals?.recommendationSignals,
    );
  }

  async updatePreferences(userId: string, dto: UpdateFeedPreferencesDto) {
    const existing = await this.store.getOrCreatePreferences(userId);
    if (existing.revision !== dto.expectedRevision) {
      this.preferenceConflict();
    }

    const nextMutedSubjects =
      dto.mutedSubjectIds === undefined
        ? existing.mutedSubjectIds
        : await this.canonicalSubjects(dto.mutedSubjectIds);
    const nextPrioritized =
      dto.prioritizedSubjectIds === undefined
        ? existing.prioritizedSubjectIds
        : await this.canonicalSubjects(dto.prioritizedSubjectIds);
    const muted = new Set(nextMutedSubjects);
    const prioritized = nextPrioritized.filter((id) => !muted.has(id));

    const mutedProfiles =
      dto.mutedProfileIds === undefined
        ? existing.mutedProfileIds
        : await this.validProfiles(dto.mutedProfileIds);

    const patch = {
      ...(dto.useAcademic === undefined
        ? {}
        : { useAcademic: dto.useAcademic }),
      ...(dto.useSocial === undefined ? {} : { useSocial: dto.useSocial }),
      ...(dto.useInterests === undefined
        ? {}
        : { useInterests: dto.useInterests }),
      mutedSubjectIds: nextMutedSubjects,
      mutedProfileIds: mutedProfiles,
      prioritizedSubjectIds: prioritized,
    };

    const updated = await this.store.updatePreferences(
      userId,
      dto.expectedRevision,
      patch,
    );
    if (!updated) this.preferenceConflict();

    const signals = await this.profiles.getFeedSignals(userId);
    return this.preferencesProjection(updated, signals?.recommendationSignals);
  }

  async academicFeed(userId: string, dto: FeedPageDto) {
    const preferences = await this.store.getOrCreatePreferences(userId);
    const cursor = this.cursor(
      dto.cursor,
      'academic',
      dto.limit,
      preferences.revision,
      'balanced',
      'chronological',
    );
    const anchorAt = cursor?.anchorAt ?? new Date();
    const participation = await this.academic.listSubjectParticipations(userId);
    const muted = new Set(preferences.mutedSubjectIds);
    const subjectIds = unique(
      participation.participations
        .filter((row) => row.state === 'current' && !muted.has(row.subjectId))
        .map((row) => row.subjectId),
    ).sort();

    if (subjectIds.length === 0) {
      return {
        items: [],
        nextCursor: null,
        stopReason: 'end' as const,
        context: { subjectIds: [] as string[] },
      };
    }

    const raw = await this.candidates(userId, {
      subjectIds,
      anchorAt,
      exploration: false,
    });
    const prepared = await this.prepareCandidates(
      userId,
      raw,
      preferences,
      anchorAt,
      {
        mode: 'balanced',
        currentSubjectIds: new Set(subjectIds),
        prioritizedSubjectIds: new Set<string>(),
        followingUserIds: new Set<string>(),
        connectionUserIds: new Set<string>(),
        followedOrganizationIds: new Set<string>(),
        interestTerms: [],
      },
    );

    const ordered = prepared.sort(compareChronological).map((candidate) => ({
      ...candidate,
      score: 0,
      why: ['current_subject'] as FeedReasonCode[],
    }));
    const page = this.page(
      ordered,
      cursor?.page ?? 0,
      dto.limit,
      takeAcademicPage,
    );

    return {
      items: await this.projectItems(page.selected),
      nextCursor: this.nextCursor({
        feed: 'academic',
        preferences,
        currentPage: cursor?.page ?? 0,
        limit: dto.limit,
        anchorAt,
        mode: 'balanced',
        order: 'chronological',
        hasMore: page.remaining.length > 0,
      }),
      stopReason: this.stopReason(cursor?.page ?? 0, page.remaining.length > 0),
      context: { subjectIds },
    };
  }

  async forYou(userId: string, dto: ForYouFeedDto) {
    const [preferences, profileSignals, relations, participation] =
      await Promise.all([
        this.store.getOrCreatePreferences(userId),
        this.profiles.getFeedSignals(userId),
        this.social.getFeedRelations(userId),
        this.academic.listSubjectParticipations(userId),
      ]);
    const cursor = this.cursor(
      dto.cursor,
      'for_you',
      dto.limit,
      preferences.revision,
      dto.mode,
      dto.order,
    );
    const anchorAt = cursor?.anchorAt ?? new Date();
    const mutedSubjects = new Set(preferences.mutedSubjectIds);
    const currentSubjectIds = new Set(
      participation.participations
        .filter((row) => row.state === 'current')
        .map((row) => row.subjectId)
        .filter((id) => !mutedSubjects.has(id)),
    );
    const prioritizedSubjectIds = new Set(
      preferences.prioritizedSubjectIds.filter((id) => !mutedSubjects.has(id)),
    );
    const recommendationSignals = profileSignals?.recommendationSignals;
    const effectiveAcademic =
      preferences.useAcademic &&
      (recommendationSignals?.academicContext ?? false);
    const effectiveSocial = preferences.useSocial;
    const effectiveInterests =
      preferences.useInterests &&
      Boolean(
        recommendationSignals?.learning ||
        recommendationSignals?.skillsInterests,
      );
    const subjectSignals = effectiveAcademic
      ? unique([...currentSubjectIds, ...prioritizedSubjectIds])
      : [];
    const socialUserIds = effectiveSocial
      ? unique([...relations.followingUserIds, ...relations.connectionUserIds])
      : [];
    const interestTerms =
      effectiveInterests && profileSignals
        ? unique([
            ...(recommendationSignals?.skillsInterests
              ? [...profileSignals.skills, ...profileSignals.interests]
              : []),
            ...(recommendationSignals?.learning
              ? [...profileSignals.helpTopics, ...profileSignals.learningTopics]
              : []),
          ])
        : [];

    const [personalRaw, organizationRows] = await Promise.all([
      dto.order === 'chronological'
        ? this.candidates(userId, { anchorAt, exploration: true })
        : this.candidates(userId, {
            subjectIds: subjectSignals,
            authorUserIds: socialUserIds,
            anchorAt,
            exploration: true,
          }),
      effectiveSocial
        ? this.organizations.getFeedCandidates(
            userId,
            anchorAt,
            CANDIDATE_LIMIT,
          )
        : Promise.resolve([]),
    ]);
    const organizationCandidates: FeedCandidate[] = organizationRows.map(
      (row) => ({
        type: 'organization_post',
        id: row.id,
        authorUserId: row.createdByUserId,
        authorProfileId: null,
        subjectId: row.subjectId,
        organization: {
          id: row.organizationId,
          name: row.organizationName,
          avatarUrl: row.organizationAvatarUrl,
          verificationState: row.verificationState,
        },
        publisherKey: `organization:${row.organizationId}`,
        title: row.title,
        summary: excerpt(row.body),
        searchableText: normalized(row.title + ' ' + row.body),
        createdAt: row.publishedAt,
      }),
    );
    const raw = [...personalRaw, ...organizationCandidates];
    const followedOrganizationIds = new Set(
      organizationCandidates.map((candidate) => candidate.organization!.id),
    );

    const prepared = await this.prepareCandidates(
      userId,
      raw,
      preferences,
      anchorAt,
      {
        mode: dto.mode,
        currentSubjectIds: effectiveAcademic
          ? currentSubjectIds
          : new Set<string>(),
        prioritizedSubjectIds: effectiveAcademic
          ? prioritizedSubjectIds
          : new Set<string>(),
        followingUserIds: effectiveSocial
          ? new Set(relations.followingUserIds)
          : new Set<string>(),
        connectionUserIds: effectiveSocial
          ? new Set(relations.connectionUserIds)
          : new Set<string>(),
        followedOrganizationIds,
        interestTerms,
      },
    );

    const ordered =
      dto.order === 'chronological'
        ? prepared
            .sort(compareChronological)
            .map((candidate) => ({ ...candidate, score: 0 }))
        : prepared.sort(compareRanked);
    const page = this.page(
      ordered,
      cursor?.page ?? 0,
      dto.limit,
      takeForYouPage,
    );

    return {
      items: await this.projectItems(page.selected),
      nextCursor: this.nextCursor({
        feed: 'for_you',
        preferences,
        currentPage: cursor?.page ?? 0,
        limit: dto.limit,
        anchorAt,
        mode: dto.mode,
        order: dto.order,
        hasMore: page.remaining.length > 0,
      }),
      stopReason: this.stopReason(cursor?.page ?? 0, page.remaining.length > 0),
      effectiveSignals: {
        academic: effectiveAcademic,
        social: effectiveSocial,
        interests: effectiveInterests,
        relationWindowTruncated: relations.truncated,
      },
    };
  }

  async setFeedback(
    userId: string,
    targetType: FeedTargetType,
    targetId: string,
    signal: FeedFeedbackSignal,
  ) {
    await this.requireFeedbackTarget(userId, targetType, targetId);
    const result = await this.store.setFeedback({
      userId,
      targetType,
      targetId,
      signal,
    });

    return {
      feedback: {
        targetType: result.feedback.targetType,
        targetId: result.feedback.targetId,
        signal: result.feedback.signal,
      },
      changed: result.changed,
      revision: result.revision,
    };
  }

  async clearFeedback(
    userId: string,
    targetType: FeedTargetType,
    targetId: string,
  ) {
    return this.store.clearFeedback({ userId, targetType, targetId });
  }

  private async candidates(
    userId: string,
    input: {
      subjectIds?: string[];
      authorUserIds?: string[];
      anchorAt: Date;
      exploration: boolean;
    },
  ): Promise<FeedCandidate[]> {
    const tasks: Array<Promise<Array<ResourceRecord | QuestionRecord>>> = [];

    if (input.subjectIds && input.subjectIds.length > 0) {
      tasks.push(
        this.resources.getFeedCandidates(userId, {
          subjectIds: input.subjectIds,
          anchorAt: input.anchorAt,
          limit: CANDIDATE_LIMIT,
        }),
        this.qa.getFeedCandidates(userId, {
          subjectIds: input.subjectIds,
          anchorAt: input.anchorAt,
          limit: CANDIDATE_LIMIT,
        }),
      );
    }

    if (input.authorUserIds && input.authorUserIds.length > 0) {
      tasks.push(
        this.resources.getFeedCandidates(userId, {
          authorUserIds: input.authorUserIds,
          anchorAt: input.anchorAt,
          limit: CANDIDATE_LIMIT,
        }),
        this.qa.getFeedCandidates(userId, {
          authorUserIds: input.authorUserIds,
          anchorAt: input.anchorAt,
          limit: CANDIDATE_LIMIT,
        }),
      );
    }

    if (input.exploration || tasks.length === 0) {
      tasks.push(
        this.resources.getFeedCandidates(userId, {
          anchorAt: input.anchorAt,
          limit: CANDIDATE_LIMIT,
        }),
        this.qa.getFeedCandidates(userId, {
          anchorAt: input.anchorAt,
          limit: CANDIDATE_LIMIT,
        }),
      );
    }

    const results = await Promise.all(tasks);
    const byKey = new Map<string, FeedCandidate>();

    for (const rows of results) {
      for (const row of rows) {
        const candidate: FeedCandidate =
          'assetId' in row
            ? {
                type: 'resource',
                id: row.id,
                authorUserId: row.authorUserId,
                authorProfileId: null,
                subjectId: row.subjectId,
                title: row.title,
                summary: excerpt(row.description),
                searchableText: normalized(
                  [row.title, row.description ?? '', ...row.tags].join(' '),
                ),
                createdAt: row.createdAt,
              }
            : {
                type: 'question',
                id: row.id,
                authorUserId: row.authorUserId,
                authorProfileId: null,
                subjectId: row.subjectId,
                title: row.title,
                summary: excerpt(row.body),
                searchableText: normalized(row.title + ' ' + row.body),
                answerCount: row.answerCount,
                createdAt: row.createdAt,
              };

        byKey.set(candidateKey(candidate), candidate);
      }
    }

    return [...byKey.values()];
  }

  private async prepareCandidates(
    userId: string,
    raw: FeedCandidate[],
    preferences: FeedPreferencesRecord,
    anchorAt: Date,
    input: Omit<FeedRankingContext, 'anchorAt' | 'feedback'>,
  ): Promise<CandidateWithProjection[]> {
    const personalUserIds = unique(
      raw
        .filter((candidate) => !candidate.organization)
        .map((candidate) => candidate.authorUserId),
    );
    const attributions =
      await this.profiles.getAttributionsForUsers(personalUserIds);
    const mutedSubjects = new Set(preferences.mutedSubjectIds);
    const mutedProfiles = new Set(preferences.mutedProfileIds);
    const eligible = raw
      .map((candidate) => {
        if (candidate.organization) {
          return {
            ...candidate,
            authorProfileId: null,
            author: {
              profileId: null,
              displayName: candidate.organization.name,
              avatarUrl: candidate.organization.avatarUrl,
            },
          };
        }

        const author = attributions.get(candidate.authorUserId) ?? null;
        return {
          ...candidate,
          authorProfileId: author?.profileId ?? null,
          author: author ?? {
            profileId: null,
            displayName: 'Usuario de Los Apuntes',
            avatarUrl: null,
          },
        };
      })
      .filter(
        (candidate) =>
          (!candidate.subjectId || !mutedSubjects.has(candidate.subjectId)) &&
          (candidate.organization ||
            !candidate.author.profileId ||
            !mutedProfiles.has(candidate.author.profileId)),
      );

    const feedbackRows = await this.store.listFeedback(
      userId,
      eligible.map((candidate) => ({
        targetType: candidate.type,
        targetId: candidate.id,
      })),
    );
    const feedback = new Map(
      feedbackRows.map((row) => [
        `${row.targetType}:${row.targetId}`,
        row.signal,
      ]),
    );
    const context: FeedRankingContext = {
      ...input,
      anchorAt,
      feedback,
    };

    return eligible.map((candidate) => ({
      ...rankFeedCandidate(candidate, context),
      author: candidate.author,
    }));
  }

  private page(
    ordered: RankedFeedCandidate[],
    page: number,
    limit: number,
    take: (
      candidates: readonly RankedFeedCandidate[],
      limit: number,
    ) => {
      selected: RankedFeedCandidate[];
      remaining: RankedFeedCandidate[];
    },
  ) {
    let remaining = [...ordered];
    let selected: RankedFeedCandidate[] = [];

    for (let index = 0; index <= page; index += 1) {
      const result = take(remaining, limit);
      selected = result.selected;
      remaining = result.remaining;
    }

    return { selected, remaining };
  }

  private async projectItems(candidates: RankedFeedCandidate[]) {
    const subjectIds = unique(
      candidates
        .map((candidate) => candidate.subjectId)
        .filter((subjectId): subjectId is string => Boolean(subjectId)),
    );
    const subjects = new Map(
      await Promise.all(
        subjectIds.map(async (subjectId) => {
          const node = await this.academic.getCatalogNode(subjectId);
          return [
            subjectId,
            { id: node.node.id, name: node.node.name },
          ] as const;
        }),
      ),
    );
    const personalUserIds = unique(
      candidates
        .filter((candidate) => !candidate.organization)
        .map((candidate) => candidate.authorUserId),
    );
    const attributions =
      await this.profiles.getAttributionsForUsers(personalUserIds);

    return candidates.map((candidate) => {
      const organization = candidate.organization;
      const author = organization
        ? {
            profileId: null,
            displayName: organization.name,
            avatarUrl: organization.avatarUrl,
          }
        : (attributions.get(candidate.authorUserId) ?? {
            profileId: null,
            displayName: 'Usuario de Los Apuntes',
            avatarUrl: null,
          });

      return {
        type: candidate.type,
        id: candidate.id,
        title: candidate.title,
        summary: candidate.summary,
        author,
        source: organization
          ? {
              kind: 'campus_organization' as const,
              organization,
            }
          : {
              kind: 'personal_user' as const,
            },
        academic: {
          subject: candidate.subjectId
            ? (subjects.get(candidate.subjectId) ?? null)
            : null,
        },
        why: candidate.why,
        createdAt: candidate.createdAt.toISOString(),
      };
    });
  }

  private cursor(
    raw: string | undefined,
    feed: FeedKind,
    limit: number,
    revision: number,
    mode: FeedMode,
    order: FeedOrder,
  ) {
    const cursor = decodeCursor(raw);
    if (!cursor) return undefined;

    if (cursor.revision !== revision) {
      throw new ConflictException({
        code: 'FEED_CURSOR_STALE',
        message: 'Feed state changed; start a fresh feed session',
      });
    }

    if (
      cursor.feed !== feed ||
      cursor.limit !== limit ||
      cursor.mode !== mode ||
      cursor.order !== order ||
      cursor.offset !== cursor.page * cursor.limit
    ) {
      throw new UnprocessableEntityException({
        code: 'FEED_CURSOR_CONTEXT_MISMATCH',
        message: 'Feed cursor does not match this request',
      });
    }

    return cursor;
  }

  private nextCursor(input: {
    feed: FeedKind;
    preferences: FeedPreferencesRecord;
    currentPage: number;
    limit: number;
    anchorAt: Date;
    mode: FeedMode;
    order: FeedOrder;
    hasMore: boolean;
  }): string | null {
    if (!input.hasMore || input.currentPage + 1 >= MAX_PAGES) return null;

    const page = input.currentPage + 1;
    return encodeCursor({
      feed: input.feed,
      anchorAt: input.anchorAt,
      revision: input.preferences.revision,
      page,
      offset: page * input.limit,
      mode: input.mode,
      order: input.order,
      limit: input.limit,
    });
  }

  private stopReason(
    currentPage: number,
    hasMore: boolean,
  ): 'end' | 'natural_break' | null {
    if (!hasMore) return 'end';
    if (currentPage + 1 >= MAX_PAGES) return 'natural_break';
    return null;
  }

  private async canonicalSubjects(ids: string[]): Promise<string[]> {
    const canonical = await Promise.all(
      unique(ids).map(async (id) => {
        const resolved = await this.academic.resolveResourceContext(id);
        return resolved.subjectId;
      }),
    );

    return unique(canonical).sort();
  }

  private async validProfiles(ids: string[]): Promise<string[]> {
    const output: string[] = [];

    for (const id of unique(ids)) {
      const userId = await this.profiles.resolveUserIdByProfileId(id);
      if (!userId) {
        throw new NotFoundException({
          code: 'FEED_PROFILE_NOT_FOUND',
          message: 'Muted Profile was not found',
        });
      }
      output.push(id);
    }

    return output.sort();
  }

  private async requireFeedbackTarget(
    userId: string,
    targetType: FeedTargetType,
    targetId: string,
  ): Promise<void> {
    try {
      if (targetType === 'resource') {
        await this.resources.get(targetId, userId);
      } else if (targetType === 'question') {
        await this.qa.get(targetId, userId);
      } else {
        await this.organizations.getFeedTarget(targetId);
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException({
          code: 'FEED_FEEDBACK_TARGET_NOT_FOUND',
          message: 'Feed feedback target was not found',
        });
      }
      throw error;
    }
  }

  private preferencesProjection(
    preferences: FeedPreferencesRecord,
    signals:
      | {
          academicContext: boolean;
          learning: boolean;
          skillsInterests: boolean;
        }
      | undefined,
  ) {
    return {
      preferences: {
        useAcademic: preferences.useAcademic,
        useSocial: preferences.useSocial,
        useInterests: preferences.useInterests,
        mutedSubjectIds: preferences.mutedSubjectIds,
        mutedProfileIds: preferences.mutedProfileIds,
        prioritizedSubjectIds: preferences.prioritizedSubjectIds,
        revision: preferences.revision,
      },
      effectiveSignals: {
        academic:
          preferences.useAcademic && (signals?.academicContext ?? false),
        social: preferences.useSocial,
        interests:
          preferences.useInterests &&
          Boolean(signals?.learning || signals?.skillsInterests),
      },
    };
  }

  private preferenceConflict(): never {
    throw new ConflictException({
      code: 'FEED_PREFERENCES_REVISION_CONFLICT',
      message: 'Feed preferences changed concurrently',
    });
  }
}
