import { MongoQaStore } from './mongo-qa.store';

function query<T>(rows: T[]) {
  const chain = {
    select: jest.fn(),
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(rows),
  };
  chain.select.mockReturnValue(chain);
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

describe('MongoQaStore Answer pagination', () => {
  it('projects bounded owner-authored Questions in stable id order', async () => {
    const rows = [
      {
        id: 'question-1',
        subjectId: 'subject-1',
        courseOfferingId: null,
        title: 'Question 1',
        body: 'Body 1',
        state: 'open',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      },
      {
        id: 'question-2',
        subjectId: 'subject-1',
        courseOfferingId: 'offering-1',
        title: 'Question 2',
        body: 'Body 2',
        state: 'closed',
        createdAt: new Date('2026-10-02T00:00:00.000Z'),
        updatedAt: new Date('2026-10-02T00:00:00.000Z'),
      },
      {
        id: 'question-3',
        subjectId: 'subject-1',
        courseOfferingId: null,
        title: 'Question 3',
        body: 'Body 3',
        state: 'open',
        createdAt: new Date('2026-10-03T00:00:00.000Z'),
        updatedAt: new Date('2026-10-03T00:00:00.000Z'),
      },
    ];
    const chain = query(rows);
    const questions = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoQaStore(
      {} as never,
      questions as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      store.listAuthoredQuestionsForExport({
        authorUserId: 'owner-1',
        limit: 2,
        afterId: 'question-before',
      }),
    ).resolves.toEqual({ items: rows.slice(0, 2), hasMore: true });

    expect(questions.find).toHaveBeenCalledWith({
      authorUserId: 'owner-1',
      id: { $gt: 'question-before' },
    });
    expect(chain.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      subjectId: 1,
      courseOfferingId: 1,
      title: 1,
      body: 1,
      state: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(chain.sort).toHaveBeenCalledWith({ id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(3);
  });

  it('projects owner-authored Answers without adding moderation or author data', async () => {
    const rows = [
      {
        id: 'answer-1',
        questionId: 'question-by-another-author',
        body: 'Answer body',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        updatedAt: new Date('2026-10-02T00:00:00.000Z'),
      },
    ];
    const chain = query(rows);
    const answers = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoQaStore(
      {} as never,
      {} as never,
      answers as never,
      {} as never,
      {} as never,
    );

    await expect(
      store.listAuthoredAnswersForExport({
        authorUserId: 'owner-1',
        limit: 1,
      }),
    ).resolves.toEqual({ items: rows, hasMore: false });

    expect(answers.find).toHaveBeenCalledWith({ authorUserId: 'owner-1' });
    expect(chain.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      questionId: 1,
      body: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(chain.sort).toHaveBeenCalledWith({ id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(2);
  });

  it('uses limit+1 and returns honest overflow metadata', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      questionId: '11111111-1111-4111-8111-111111111111',
      authorUserId: 'user-1',
      body: `Answer ${index}`,
      moderationState: 'available',
      revision: 1,
      createdAt: new Date(`2026-09-23T1${index}:00:00.000Z`),
      updatedAt: new Date(`2026-09-23T1${index}:00:00.000Z`),
    }));
    const chain = query(rows);
    const answers = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoQaStore(
      {} as never,
      {} as never,
      answers as never,
      {} as never,
      {} as never,
    );

    const result = await store.listAnswers({
      questionId: '11111111-1111-4111-8111-111111111111',
      limit: 3,
    });

    expect(answers.find).toHaveBeenCalledWith({
      $and: [
        {
          questionId: '11111111-1111-4111-8111-111111111111',
          moderationState: 'available',
        },
      ],
    });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: 1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(4);
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(true);
  });

  it('does not report overflow at exactly the page budget', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      questionId: '11111111-1111-4111-8111-111111111111',
      authorUserId: 'user-1',
      body: `Answer ${index}`,
      moderationState: 'available',
      revision: 1,
      createdAt: new Date('2026-09-23T15:00:00.000Z'),
      updatedAt: new Date('2026-09-23T15:00:00.000Z'),
    }));
    const chain = query(rows);
    const answers = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoQaStore(
      {} as never,
      {} as never,
      answers as never,
      {} as never,
      {} as never,
    );

    const result = await store.listAnswers({
      questionId: '11111111-1111-4111-8111-111111111111',
      limit: 3,
    });

    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(false);
  });

  it('applies the createdAt/id continuation predicate before limiting', async () => {
    const chain = query([]);
    const answers = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoQaStore(
      {} as never,
      {} as never,
      answers as never,
      {} as never,
      {} as never,
    );
    const createdAt = new Date('2026-09-23T15:00:00.000Z');

    await store.listAnswers({
      questionId: '11111111-1111-4111-8111-111111111111',
      limit: 25,
      after: {
        createdAt,
        id: '22222222-2222-4222-8222-222222222222',
      },
    });

    expect(answers.find).toHaveBeenCalledWith({
      $and: [
        {
          questionId: '11111111-1111-4111-8111-111111111111',
          moderationState: 'available',
        },
        {
          $or: [
            { createdAt: { $gt: createdAt } },
            {
              createdAt,
              id: { $gt: '22222222-2222-4222-8222-222222222222' },
            },
          ],
        },
      ],
    });
    expect(chain.limit).toHaveBeenCalledWith(26);
  });
});

describe('MongoQaStore submitted report export', () => {
  it('projects exact-owner Q&A reports with stable bounded id pagination', async () => {
    const rows = [
      {
        id: 'qa-report-a',
        targetType: 'question',
        targetId: 'question-ref-a',
        reason: 'spam',
        details: null,
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        status: 'pending',
        reviewedByUserId: 'moderator',
      },
      {
        id: 'qa-report-b',
        targetType: 'answer',
        targetId: 'answer-ref-b',
        reason: 'plagiarism',
        details: 'Owner text',
        createdAt: new Date('2026-10-02T00:00:00.000Z'),
      },
      {
        id: 'qa-report-c',
        targetType: 'question',
        targetId: 'question-ref-c',
        reason: 'other',
        details: null,
        createdAt: new Date('2026-10-03T00:00:00.000Z'),
      },
    ];
    const chain = query(rows);
    const reports = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoQaStore(
      {} as never,
      {} as never,
      {} as never,
      reports as never,
      {} as never,
    );

    await expect(
      store.listSubmittedReportsForExport({
        reporterUserId: 'owner-1',
        limit: 2,
        afterId: 'qa-report-before',
      }),
    ).resolves.toEqual({ items: rows.slice(0, 2), hasMore: true });

    expect(reports.find).toHaveBeenCalledWith({
      reporterUserId: 'owner-1',
      id: { $gt: 'qa-report-before' },
    });
    expect(chain.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      targetType: 1,
      targetId: 1,
      reason: 1,
      details: 1,
      createdAt: 1,
    });
    expect(chain.sort).toHaveBeenCalledWith({ id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(3);
  });
});
