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

const anchor = new Date('2026-09-23T17:00:00.000Z');

function candidate(overrides: Partial<FeedCandidate> = {}): FeedCandidate {
  return {
    type: 'resource',
    id: '11111111-1111-4111-8111-111111111111',
    authorUserId: 'author-a',
    authorProfileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    subjectId: '22222222-2222-4222-8222-222222222222',
    title: 'Base de Datos',
    summary: 'Normalización y dependencias',
    searchableText: 'base de datos normalización dependencias sql',
    createdAt: new Date('2026-09-23T12:00:00.000Z'),
    ...overrides,
  };
}

function context(
  overrides: Partial<FeedRankingContext> = {},
): FeedRankingContext {
  return {
    anchorAt: anchor,
    mode: 'balanced',
    currentSubjectIds: new Set(),
    prioritizedSubjectIds: new Set(),
    followingUserIds: new Set(),
    connectionUserIds: new Set(),
    followedOrganizationIds: new Set(),
    interestTerms: [],
    feedback: new Map(),
    ...overrides,
  };
}

describe('Feed ranking', () => {
  it('scores only explicit supported relevance signals', () => {
    const row = candidate({ type: 'question', answerCount: 0 });
    const ranked = rankFeedCandidate(
      row,
      context({
        currentSubjectIds: new Set([row.subjectId!]),
        prioritizedSubjectIds: new Set([row.subjectId!]),
        connectionUserIds: new Set([row.authorUserId]),
        followingUserIds: new Set([row.authorUserId]),
        interestTerms: ['SQL', 'normalización'],
        feedback: new Map([[`question:${row.id}`, 'more']]),
      }),
    );

    expect(ranked.score).toBeGreaterThan(100);
    expect(ranked.why).toEqual(
      expect.arrayContaining([
        'current_subject',
        'prioritized_subject',
        'connection',
        'interest_match',
        'unanswered_question',
        'fresh',
        'explicit_more',
      ]),
    );
    expect(ranked.why).not.toContain('following');
  });

  it('applies less feedback as a penalty without inventing a public reason', () => {
    const row = candidate();
    const neutral = rankFeedCandidate(row, context());
    const less = rankFeedCandidate(
      row,
      context({
        feedback: new Map([[`resource:${row.id}`, 'less']]),
      }),
    );

    expect(less.score).toBe(neutral.score - 35);
    expect(less.why).not.toContain('explicit_more');
  });

  it('uses exploration only when no relevance signal exists', () => {
    const exploratory = rankFeedCandidate(candidate(), context());
    expect(exploratory.why).toContain('exploration');

    const academic = rankFeedCandidate(
      candidate(),
      context({
        currentSubjectIds: new Set(['22222222-2222-4222-8222-222222222222']),
      }),
    );
    expect(academic.why).not.toContain('exploration');
  });

  it('makes study mode favor academic and unmet-need signals', () => {
    const row = candidate({ type: 'question', answerCount: 0 });
    const balanced = rankFeedCandidate(
      row,
      context({ currentSubjectIds: new Set([row.subjectId!]) }),
    );
    const study = rankFeedCandidate(
      row,
      context({
        mode: 'study',
        currentSubjectIds: new Set([row.subjectId!]),
      }),
    );

    expect(study.score).toBeGreaterThan(balanced.score);
  });

  it('makes community mode favor explicit social relations', () => {
    const row = candidate();
    const balanced = rankFeedCandidate(
      row,
      context({ followingUserIds: new Set([row.authorUserId]) }),
    );
    const community = rankFeedCandidate(
      row,
      context({
        mode: 'community',
        followingUserIds: new Set([row.authorUserId]),
      }),
    );

    expect(community.score).toBeGreaterThan(balanced.score);
  });

  it('makes discover mode favor explicit interest matches', () => {
    const row = candidate();
    const balanced = rankFeedCandidate(
      row,
      context({ interestTerms: ['sql'] }),
    );
    const discover = rankFeedCandidate(
      row,
      context({ mode: 'discover', interestTerms: ['sql'] }),
    );

    expect(discover.score).toBeGreaterThan(balanced.score);
  });

  it('decays freshness without using attention metrics', () => {
    const fresh = rankFeedCandidate(candidate(), context());
    const old = rankFeedCandidate(
      candidate({ createdAt: new Date('2025-01-01T00:00:00.000Z') }),
      context(),
    );

    expect(fresh.score).toBeGreaterThan(old.score);
    expect(old.why).not.toContain('fresh');
  });

  it('uses stable score, time, type and id ordering', () => {
    const first: RankedFeedCandidate = {
      ...candidate({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      score: 10,
      why: [],
    };
    const higher: RankedFeedCandidate = {
      ...candidate({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
      score: 20,
      why: [],
    };

    expect([first, higher].sort(compareRanked)[0]?.id).toBe(higher.id);

    const newer = {
      ...first,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: new Date('2026-09-23T16:00:00.000Z'),
    };
    expect([first, newer].sort(compareChronological)[0]?.id).toBe(newer.id);
  });

  it('caps one author to two items in a For You page', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      ...candidate({
        id: `0000000${index}-0000-4000-8000-00000000000${index}`,
        authorUserId: 'same-author',
        subjectId: `1000000${index}-0000-4000-8000-00000000000${index}`,
      }),
      score: 100 - index,
      why: [] as RankedFeedCandidate['why'],
    }));

    const page = takeForYouPage(rows, 5);
    expect(page.selected).toHaveLength(2);
    expect(page.remaining).toHaveLength(3);
  });

  it('caps one subject to four items in a For You page', () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      ...candidate({
        id: `2000000${index}-0000-4000-8000-00000000000${index}`,
        authorUserId: `author-${index}`,
        subjectId: '22222222-2222-4222-8222-222222222222',
      }),
      score: 100 - index,
      why: [] as RankedFeedCandidate['why'],
    }));

    const page = takeForYouPage(rows, 7);
    expect(page.selected).toHaveLength(4);
    expect(page.remaining).toHaveLength(3);
  });

  it('mixes content types on the first pass and fills when supply is uneven', () => {
    const resources = Array.from({ length: 5 }, (_, index) => ({
      ...candidate({
        id: `3000000${index}-0000-4000-8000-00000000000${index}`,
        authorUserId: `resource-author-${index}`,
        subjectId: `4000000${index}-0000-4000-8000-00000000000${index}`,
      }),
      score: 100 - index,
      why: [] as RankedFeedCandidate['why'],
    }));
    const question: RankedFeedCandidate = {
      ...candidate({
        type: 'question',
        id: '55555555-5555-4555-8555-555555555555',
        authorUserId: 'question-author',
        subjectId: '66666666-6666-4666-8666-666666666666',
      }),
      score: 50,
      why: [],
    };

    const page = takeForYouPage([...resources, question], 5);
    expect(page.selected.some((row) => row.type === 'question')).toBe(true);
    expect(page.selected).toHaveLength(5);
  });

  it('uses a looser but bounded author cap for Academic pages', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      ...candidate({
        id: `7000000${index}-0000-4000-8000-00000000000${index}`,
        authorUserId: 'same-author',
      }),
      score: 0,
      why: [] as RankedFeedCandidate['why'],
    }));

    const page = takeAcademicPage(rows, 5);
    expect(page.selected).toHaveLength(3);
    expect(page.remaining).toHaveLength(2);
  });

  it('uses explicit organization follow without inheriting manager relations', () => {
    const row = candidate({
      type: 'organization_post',
      authorUserId: 'manager-user',
      authorProfileId: null,
      subjectId: null,
      organization: {
        id: '99999999-9999-4999-8999-999999999999',
        name: 'Centro de Estudiantes',
        avatarUrl: null,
        verificationState: 'verified',
      },
      publisherKey: 'organization:99999999-9999-4999-8999-999999999999',
    });

    const ranked = rankFeedCandidate(
      row,
      context({
        followedOrganizationIds: new Set([row.organization!.id]),
        followingUserIds: new Set(['manager-user']),
        connectionUserIds: new Set(['manager-user']),
      }),
    );

    expect(ranked.why).toContain('organization_following');
    expect(ranked.why).not.toContain('following');
    expect(ranked.why).not.toContain('connection');
  });

  it('does not treat a manager relation as an organization-follow signal', () => {
    const row = candidate({
      type: 'organization_post',
      authorUserId: 'manager-user',
      authorProfileId: null,
      organization: {
        id: '99999999-9999-4999-8999-999999999999',
        name: 'Club de Robótica',
        avatarUrl: null,
        verificationState: 'unverified',
      },
      publisherKey: 'organization:99999999-9999-4999-8999-999999999999',
    });

    const ranked = rankFeedCandidate(
      row,
      context({
        followingUserIds: new Set(['manager-user']),
        connectionUserIds: new Set(['manager-user']),
      }),
    );

    expect(ranked.why).not.toContain('organization_following');
    expect(ranked.why).not.toContain('following');
    expect(ranked.why).not.toContain('connection');
  });
});
