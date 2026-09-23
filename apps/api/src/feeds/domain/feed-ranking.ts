import type {
  FeedFeedbackSignal,
  FeedMode,
  FeedReasonCode,
  FeedTargetType,
} from './feed.types';

export interface FeedCandidate {
  type: FeedTargetType;
  id: string;
  authorUserId: string;
  authorProfileId: string | null;
  subjectId: string;
  title: string;
  summary: string;
  searchableText: string;
  answerCount?: number;
  createdAt: Date;
}

export interface RankedFeedCandidate extends FeedCandidate {
  score: number;
  why: FeedReasonCode[];
}

export interface FeedRankingContext {
  anchorAt: Date;
  mode: FeedMode;
  currentSubjectIds: ReadonlySet<string>;
  prioritizedSubjectIds: ReadonlySet<string>;
  followingUserIds: ReadonlySet<string>;
  connectionUserIds: ReadonlySet<string>;
  interestTerms: readonly string[];
  feedback: ReadonlyMap<string, FeedFeedbackSignal>;
}

function key(candidate: Pick<FeedCandidate, 'type' | 'id'>): string {
  return `${candidate.type}:${candidate.id}`;
}

function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es-AR');
}

function freshScore(createdAt: Date, anchorAt: Date): number {
  const age = Math.max(0, anchorAt.getTime() - createdAt.getTime());
  const day = 24 * 60 * 60 * 1000;

  if (age <= day) return 20;
  if (age <= 7 * day) return 15;
  if (age <= 30 * day) return 10;
  if (age <= 90 * day) return 5;
  return 0;
}

function interestMatches(
  candidateText: string,
  terms: readonly string[],
): number {
  const haystack = normalized(candidateText);
  let matches = 0;

  for (const term of terms) {
    const needle = normalized(term);
    if (needle.length >= 2 && haystack.includes(needle)) matches += 1;
    if (matches >= 4) break;
  }

  return matches;
}

function pushReason(reasons: FeedReasonCode[], reason: FeedReasonCode): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

export function rankFeedCandidate(
  candidate: FeedCandidate,
  context: FeedRankingContext,
): RankedFeedCandidate {
  let score = 0;
  const why: FeedReasonCode[] = [];

  if (context.currentSubjectIds.has(candidate.subjectId)) {
    score += context.mode === 'study' ? 50 : 40;
    pushReason(why, 'current_subject');
  }

  if (context.prioritizedSubjectIds.has(candidate.subjectId)) {
    score += context.mode === 'study' ? 30 : 20;
    pushReason(why, 'prioritized_subject');
  }

  if (context.connectionUserIds.has(candidate.authorUserId)) {
    score += context.mode === 'community' ? 45 : 30;
    pushReason(why, 'connection');
  } else if (context.followingUserIds.has(candidate.authorUserId)) {
    score += context.mode === 'community' ? 30 : 20;
    pushReason(why, 'following');
  }

  const matches = interestMatches(
    candidate.searchableText,
    context.interestTerms,
  );
  if (matches > 0) {
    score += Math.min(20, matches * 5) + (context.mode === 'discover' ? 10 : 0);
    pushReason(why, 'interest_match');
  }

  if (candidate.type === 'question' && candidate.answerCount === 0) {
    score += context.mode === 'study' ? 25 : 15;
    pushReason(why, 'unanswered_question');
  }

  const freshness = freshScore(candidate.createdAt, context.anchorAt);
  if (freshness > 0) {
    score += freshness;
    pushReason(why, 'fresh');
  }

  const explicit = context.feedback.get(key(candidate));
  if (explicit === 'more') {
    score += 25;
    pushReason(why, 'explicit_more');
  } else if (explicit === 'less') {
    score -= 35;
  }

  const hasRelevance = why.some((reason) =>
    [
      'current_subject',
      'prioritized_subject',
      'connection',
      'following',
      'interest_match',
      'unanswered_question',
      'explicit_more',
    ].includes(reason),
  );

  if (!hasRelevance) {
    score += context.mode === 'discover' ? 15 : 5;
    pushReason(why, 'exploration');
  }

  return { ...candidate, score, why };
}

export function compareRanked(
  left: RankedFeedCandidate,
  right: RankedFeedCandidate,
): number {
  return (
    right.score - left.score ||
    right.createdAt.getTime() - left.createdAt.getTime() ||
    left.type.localeCompare(right.type) ||
    left.id.localeCompare(right.id)
  );
}

export function compareChronological(
  left: FeedCandidate,
  right: FeedCandidate,
): number {
  return (
    right.createdAt.getTime() - left.createdAt.getTime() ||
    left.type.localeCompare(right.type) ||
    left.id.localeCompare(right.id)
  );
}

export function takeAcademicPage(
  candidates: readonly RankedFeedCandidate[],
  limit: number,
): {
  selected: RankedFeedCandidate[];
  remaining: RankedFeedCandidate[];
} {
  const authorCounts = new Map<string, number>();
  const selected: RankedFeedCandidate[] = [];
  const remaining: RankedFeedCandidate[] = [];

  for (const candidate of candidates) {
    const authorCount = authorCounts.get(candidate.authorUserId) ?? 0;
    if (selected.length < limit && authorCount < 3) {
      selected.push(candidate);
      authorCounts.set(candidate.authorUserId, authorCount + 1);
    } else {
      remaining.push(candidate);
    }
  }

  return { selected, remaining };
}

export function takeForYouPage(
  candidates: readonly RankedFeedCandidate[],
  limit: number,
): {
  selected: RankedFeedCandidate[];
  remaining: RankedFeedCandidate[];
} {
  const authorCounts = new Map<string, number>();
  const subjectCounts = new Map<string, number>();
  const typeCounts = new Map<FeedTargetType, number>();
  const selected: RankedFeedCandidate[] = [];
  const deferred: RankedFeedCandidate[] = [];
  const typeCap = Math.max(1, Math.ceil(limit * 0.7));

  const canTake = (
    candidate: RankedFeedCandidate,
    enforceTypeCap: boolean,
  ): boolean => {
    if ((authorCounts.get(candidate.authorUserId) ?? 0) >= 2) return false;
    if ((subjectCounts.get(candidate.subjectId) ?? 0) >= 4) return false;
    if (enforceTypeCap && (typeCounts.get(candidate.type) ?? 0) >= typeCap) {
      return false;
    }
    return true;
  };

  const take = (candidate: RankedFeedCandidate) => {
    selected.push(candidate);
    authorCounts.set(
      candidate.authorUserId,
      (authorCounts.get(candidate.authorUserId) ?? 0) + 1,
    );
    subjectCounts.set(
      candidate.subjectId,
      (subjectCounts.get(candidate.subjectId) ?? 0) + 1,
    );
    typeCounts.set(candidate.type, (typeCounts.get(candidate.type) ?? 0) + 1);
  };

  for (const candidate of candidates) {
    if (selected.length < limit && canTake(candidate, true)) {
      take(candidate);
    } else {
      deferred.push(candidate);
    }
  }

  const remaining: RankedFeedCandidate[] = [];
  for (const candidate of deferred) {
    if (selected.length < limit && canTake(candidate, false)) {
      take(candidate);
    } else {
      remaining.push(candidate);
    }
  }

  return { selected, remaining };
}
