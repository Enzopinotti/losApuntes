import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AcademicService } from '../../academic/domain/academic.service';
import type { ProfileService } from '../../profile/domain/profile.service';
import type { QaStore } from './qa.store';
import { QaService } from './qa.service';
import type { AnswerRecord, QaReportRecord, QuestionRecord } from './qa.types';

const now = new Date('2026-09-23T15:00:00.000Z');
const subjectId = '11111111-1111-4111-8111-111111111111';
const questionId = '22222222-2222-4222-8222-222222222222';
const answerId = '33333333-3333-4333-8333-333333333333';

type AcademicApi = Pick<
  AcademicService,
  'resolveResourceContext' | 'getCatalogNode'
>;
type ProfileApi = Pick<ProfileService, 'getAttributionForUser'>;

function store(): jest.Mocked<QaStore> {
  return {
    createQuestion: jest.fn(),
    findQuestion: jest.fn(),
    searchQuestions: jest.fn(),
    listFeedCandidates: jest.fn(),
    updateQuestionOwned: jest.fn(),
    listAnswers: jest.fn(),
    findAnswer: jest.fn(),
    createAnswerAtomic: jest.fn(),
    updateAnswerOwned: jest.fn(),
    acceptAnswerAtomic: jest.fn(),
    upsertPendingReport: jest.fn(),
  };
}

function academic(): jest.Mocked<AcademicApi> {
  return {
    resolveResourceContext: jest.fn(),
    getCatalogNode: jest.fn(),
  };
}

function profiles(): jest.Mocked<ProfileApi> {
  return {
    getAttributionForUser: jest.fn(),
  };
}

function service(
  qaStore: jest.Mocked<QaStore>,
  academicApi: jest.Mocked<AcademicApi>,
  profileApi: jest.Mocked<ProfileApi>,
) {
  return new QaService(
    qaStore,
    academicApi as unknown as AcademicService,
    profileApi as unknown as ProfileService,
  );
}

function question(overrides: Partial<QuestionRecord> = {}): QuestionRecord {
  return {
    id: questionId,
    authorUserId: 'user-a',
    subjectId,
    courseOfferingId: null,
    title: 'Normalización de bases de datos',
    body: '¿Cómo paso de segunda a tercera forma normal?',
    searchText:
      'normalización de bases de datos cómo paso de segunda a tercera forma normal',
    state: 'open',
    moderationState: 'available',
    answerCount: 0,
    acceptedAnswerId: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function answer(overrides: Partial<AnswerRecord> = {}): AnswerRecord {
  return {
    id: answerId,
    questionId,
    authorUserId: 'user-b',
    body: 'Primero eliminá dependencias transitivas.',
    moderationState: 'available',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function report(overrides: Partial<QaReportRecord> = {}): QaReportRecord {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    targetType: 'question',
    targetId: questionId,
    reporterUserId: 'user-b',
    reason: 'misinformation',
    details: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function configureProjection(
  academicApi: jest.Mocked<AcademicApi>,
  profileApi: jest.Mocked<ProfileApi>,
): void {
  academicApi.getCatalogNode.mockResolvedValue({
    node: {
      id: subjectId,
      kind: 'subject',
      name: 'Base de Datos',
    },
    resolvedFromId: undefined,
  } as never);
  profileApi.getAttributionForUser.mockImplementation((userId) =>
    Promise.resolve({
      profileId:
        userId === 'user-a'
          ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      displayName: userId === 'user-a' ? 'Ana' : 'Bruno',
      avatarUrl: null,
    }),
  );
}

describe('QaService', () => {
  it('canonicalizes academic context before creating a Question', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    configureProjection(academicApi, profileApi);
    profileApi.getAttributionForUser.mockResolvedValue({
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: 'Ana',
      avatarUrl: null,
    });
    academicApi.resolveResourceContext.mockResolvedValue({
      subjectId,
      courseOfferingId: null,
    });
    qaStore.createQuestion.mockImplementation((input) =>
      Promise.resolve({
        ...input,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const result = await service(qaStore, academicApi, profileApi).create(
      'user-a',
      {
        subjectId: '99999999-9999-4999-8999-999999999999',
        title: '  Normalización   de bases de datos ',
        body: ' ¿Cómo paso de segunda a tercera forma normal? ',
      },
    );

    expect(academicApi.resolveResourceContext).toHaveBeenCalledWith(
      '99999999-9999-4999-8999-999999999999',
      undefined,
    );
    expect(qaStore.createQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        authorUserId: 'user-a',
        subjectId,
        title: 'Normalización de bases de datos',
        body: '¿Cómo paso de segunda a tercera forma normal?',
        state: 'open',
        moderationState: 'available',
        answerCount: 0,
        revision: 1,
      }),
    );
    expect(result.question.academic.subject.id).toBe(subjectId);
  });

  it('rejects contribution when the actor has no Profile', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    profileApi.getAttributionForUser.mockResolvedValue(null);

    await expect(
      service(qaStore, academicApi, profileApi).create('user-a', {
        subjectId,
        title: 'Pregunta válida',
        body: 'Este cuerpo tiene longitud suficiente.',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(qaStore.createQuestion).not.toHaveBeenCalled();
  });

  it('returns viewer capabilities without exposing account ids', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    configureProjection(academicApi, profileApi);
    qaStore.findQuestion.mockResolvedValue(question());
    qaStore.listAnswers.mockResolvedValue([answer()]);

    const result = await service(qaStore, academicApi, profileApi).get(
      questionId,
      'user-a',
    );

    expect(result.question.viewer).toEqual({
      canEdit: true,
      canAnswer: true,
      canAcceptAnswers: true,
      canReport: true,
    });
    expect(result.answers[0]?.viewer).toEqual({
      canEdit: false,
      canReport: true,
    });
    expect(JSON.stringify(result)).not.toContain('authorUserId');
    expect(JSON.stringify(result)).not.toContain('user-a');
  });

  it('fails closed for hidden Questions and Answers', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    qaStore.findQuestion.mockResolvedValue(
      question({ moderationState: 'hidden' }),
    );

    await expect(
      service(qaStore, academicApi, profileApi).get(questionId),
    ).rejects.toBeInstanceOf(NotFoundException);

    qaStore.findAnswer.mockResolvedValue(answer({ moderationState: 'hidden' }));

    await expect(
      service(qaStore, academicApi, profileApi).updateAnswer(
        'user-b',
        answerId,
        { expectedRevision: 1, body: 'Nueva respuesta' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects malformed search cursors before persistence', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();

    await expect(
      service(qaStore, academicApi, profileApi).search({
        q: 'base de datos',
        limit: 10,
        cursor: 'invalid-cursor',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(qaStore.searchQuestions).not.toHaveBeenCalled();
  });

  it('updates only an owned Question with optimistic concurrency', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    configureProjection(academicApi, profileApi);
    qaStore.findQuestion.mockResolvedValue(question());
    qaStore.updateQuestionOwned.mockResolvedValue(
      question({
        title: 'Normalización y dependencias',
        revision: 2,
      }),
    );

    const result = await service(qaStore, academicApi, profileApi).update(
      'user-a',
      questionId,
      {
        expectedRevision: 1,
        title: ' Normalización   y dependencias ',
      },
    );

    expect(result.question.revision).toBe(2);
    const updateQuestionCall = qaStore.updateQuestionOwned.mock.calls[0];
    expect(updateQuestionCall?.[0]).toBe(questionId);
    expect(updateQuestionCall?.[1]).toBe('user-a');
    expect(updateQuestionCall?.[2]).toBe(1);
    expect(updateQuestionCall?.[3]?.title).toBe('Normalización y dependencias');
    expect(typeof updateQuestionCall?.[3]?.searchText).toBe('string');

    qaStore.updateQuestionOwned.mockResolvedValue(null);
    await expect(
      service(qaStore, academicApi, profileApi).update('user-a', questionId, {
        expectedRevision: 1,
        status: 'closed',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hides Question ownership from non-authors', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    qaStore.findQuestion.mockResolvedValue(question());

    await expect(
      service(qaStore, academicApi, profileApi).update('user-b', questionId, {
        expectedRevision: 1,
        status: 'closed',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects new Answers when the Question is closed', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    profileApi.getAttributionForUser.mockResolvedValue({
      profileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      displayName: 'Bruno',
      avatarUrl: null,
    });
    qaStore.findQuestion.mockResolvedValue(question({ state: 'closed' }));

    await expect(
      service(qaStore, academicApi, profileApi).createAnswer(
        'user-b',
        questionId,
        { body: 'Respuesta' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(qaStore.createAnswerAtomic).not.toHaveBeenCalled();
  });

  it('creates an Answer and notification through one atomic store call', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    configureProjection(academicApi, profileApi);
    qaStore.findQuestion.mockResolvedValue(question());
    qaStore.createAnswerAtomic.mockResolvedValue(answer());

    const result = await service(qaStore, academicApi, profileApi).createAnswer(
      'user-b',
      questionId,
      {
        body: ' Primero eliminá dependencias transitivas. ',
      },
    );

    expect(result.answer.body).toBe(
      'Primero eliminá dependencias transitivas.',
    );
    const createAnswerCall = qaStore.createAnswerAtomic.mock.calls[0]?.[0];
    expect(createAnswerCall?.answer.questionId).toBe(questionId);
    expect(createAnswerCall?.answer.authorUserId).toBe('user-b');
    expect(createAnswerCall?.answer.revision).toBe(1);
    expect(createAnswerCall?.notification?.userId).toBe('user-a');
    expect(createAnswerCall?.notification?.actorUserId).toBe('user-b');
    expect(createAnswerCall?.notification?.type).toBe('qa.question_answered');
    expect(createAnswerCall?.notification?.targetId).toBe(questionId);
  });

  it('rejects Answer creation if the Question closes concurrently', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    profileApi.getAttributionForUser.mockResolvedValue({
      profileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      displayName: 'Bruno',
      avatarUrl: null,
    });
    qaStore.findQuestion.mockResolvedValue(question());
    qaStore.createAnswerAtomic.mockResolvedValue(null);

    await expect(
      service(qaStore, academicApi, profileApi).createAnswer(
        'user-b',
        questionId,
        { body: 'Respuesta concurrente' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates only the Answer author with optimistic concurrency', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    configureProjection(academicApi, profileApi);
    qaStore.findAnswer.mockResolvedValue(answer());
    qaStore.updateAnswerOwned.mockResolvedValue(
      answer({ body: 'Respuesta corregida', revision: 2 }),
    );

    const result = await service(qaStore, academicApi, profileApi).updateAnswer(
      'user-b',
      answerId,
      { expectedRevision: 1, body: ' Respuesta   corregida ' },
    );
    expect(result.answer.revision).toBe(2);

    qaStore.findAnswer.mockResolvedValue(answer());
    await expect(
      service(qaStore, academicApi, profileApi).updateAnswer(
        'user-a',
        answerId,
        { expectedRevision: 1, body: 'No autorizado' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects accepting an Answer from another Question', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    qaStore.findQuestion.mockResolvedValue(question());
    qaStore.findAnswer.mockResolvedValue(
      answer({
        questionId: '55555555-5555-4555-8555-555555555555',
      }),
    );

    await expect(
      service(qaStore, academicApi, profileApi).acceptAnswer(
        'user-a',
        questionId,
        answerId,
        1,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(qaStore.acceptAnswerAtomic).not.toHaveBeenCalled();
  });

  it('accepts a same-Question Answer with revision fencing and notification', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    configureProjection(academicApi, profileApi);
    qaStore.findQuestion.mockResolvedValue(question());
    qaStore.findAnswer.mockResolvedValue(answer());
    qaStore.acceptAnswerAtomic.mockResolvedValue(
      question({
        acceptedAnswerId: answerId,
        revision: 2,
      }),
    );

    const result = await service(qaStore, academicApi, profileApi).acceptAnswer(
      'user-a',
      questionId,
      answerId,
      1,
    );

    expect(result.question.acceptedAnswerId).toBe(answerId);
    const acceptCall = qaStore.acceptAnswerAtomic.mock.calls[0]?.[0];
    expect(acceptCall?.questionId).toBe(questionId);
    expect(acceptCall?.answerId).toBe(answerId);
    expect(acceptCall?.authorUserId).toBe('user-a');
    expect(acceptCall?.expectedRevision).toBe(1);
    expect(acceptCall?.notification?.userId).toBe('user-b');
    expect(acceptCall?.notification?.actorUserId).toBe('user-a');
    expect(acceptCall?.notification?.type).toBe('qa.answer_accepted');
    expect(acceptCall?.notification?.targetType).toBe('question');
    expect(acceptCall?.notification?.targetId).toBe(questionId);
  });

  it('returns revision conflict when Answer acceptance loses the race', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    qaStore.findQuestion.mockResolvedValue(question());
    qaStore.findAnswer.mockResolvedValue(answer());
    qaStore.acceptAnswerAtomic.mockResolvedValue(null);

    await expect(
      service(qaStore, academicApi, profileApi).acceptAnswer(
        'user-a',
        questionId,
        answerId,
        1,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns the durable pending report projection from the store authority', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    qaStore.findQuestion.mockResolvedValue(question());
    qaStore.upsertPendingReport.mockResolvedValue(report());

    const first = await service(
      qaStore,
      academicApi,
      profileApi,
    ).reportQuestion('user-b', questionId, 'misinformation', null);

    expect(first.report).toEqual({
      id: '44444444-4444-4444-8444-444444444444',
      targetType: 'question',
      targetId: questionId,
      reason: 'misinformation',
      status: 'pending',
      createdAt: now.toISOString(),
    });
  });

  it('searches with canonical academic filters and a deterministic cursor', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    configureProjection(academicApi, profileApi);
    academicApi.resolveResourceContext.mockResolvedValue({
      subjectId,
      courseOfferingId: null,
    });
    qaStore.searchQuestions.mockResolvedValueOnce({
      items: [question()],
      hasMore: true,
    });

    const first = await service(qaStore, academicApi, profileApi).search(
      {
        q: '  NORMALIZACIÓN  ',
        subjectId: '99999999-9999-4999-8999-999999999999',
        status: 'open',
        limit: 1,
      },
      'user-a',
    );

    expect(academicApi.resolveResourceContext).toHaveBeenCalledWith(
      '99999999-9999-4999-8999-999999999999',
    );
    expect(qaStore.searchQuestions).toHaveBeenCalledWith({
      q: 'normalización',
      subjectId,
      state: 'open',
      limit: 1,
      after: undefined,
    });
    expect(first.items[0]?.viewer).toEqual({
      canEdit: true,
      canAnswer: true,
      canAcceptAnswers: true,
      canReport: true,
    });
    expect(first.nextCursor).not.toBeNull();

    qaStore.searchQuestions.mockResolvedValueOnce({
      items: [],
      hasMore: false,
    });

    await service(qaStore, academicApi, profileApi).search({
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });

    expect(qaStore.searchQuestions).toHaveBeenLastCalledWith({
      limit: 1,
      after: {
        updatedAt: now,
        id: questionId,
      },
    });
  });

  it('returns an empty unfiltered search without inventing a cursor', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    qaStore.searchQuestions.mockResolvedValue({
      items: [],
      hasMore: false,
    });

    const result = await service(qaStore, academicApi, profileApi).search({
      limit: 25,
    });

    expect(result).toEqual({ items: [], nextCursor: null });
    expect(qaStore.searchQuestions).toHaveBeenCalledWith({
      limit: 25,
      after: undefined,
    });
    expect(academicApi.resolveResourceContext).not.toHaveBeenCalled();
  });

  it('rejects a cursor whose encoded date is invalid', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    const cursor = Buffer.from(
      JSON.stringify({ updatedAt: 'not-a-date', id: questionId }),
      'utf8',
    ).toString('base64url');

    await expect(
      service(qaStore, academicApi, profileApi).search({
        limit: 10,
        cursor,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(qaStore.searchQuestions).not.toHaveBeenCalled();
  });

  it('rejects empty Question updates and supports status-only updates', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    configureProjection(academicApi, profileApi);
    qaStore.findQuestion.mockResolvedValue(question());

    await expect(
      service(qaStore, academicApi, profileApi).update('user-a', questionId, {
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    qaStore.updateQuestionOwned.mockResolvedValue(
      question({ state: 'closed', revision: 2 }),
    );

    const result = await service(qaStore, academicApi, profileApi).update(
      'user-a',
      questionId,
      {
        expectedRevision: 1,
        status: 'closed',
      },
    );

    expect(result.question.state).toBe('closed');
    expect(qaStore.updateQuestionOwned).toHaveBeenLastCalledWith(
      questionId,
      'user-a',
      1,
      { state: 'closed' },
    );
  });

  it('creates an Answer by the Question author without a self-notification', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    configureProjection(academicApi, profileApi);
    profileApi.getAttributionForUser.mockResolvedValue({
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: 'Ana',
      avatarUrl: null,
    });
    qaStore.findQuestion.mockResolvedValue(question());
    qaStore.createAnswerAtomic.mockResolvedValue(
      answer({ authorUserId: 'user-a' }),
    );

    await service(qaStore, academicApi, profileApi).createAnswer(
      'user-a',
      questionId,
      { body: 'Aclaración del autor' },
    );

    const call = qaStore.createAnswerAtomic.mock.calls[0]?.[0];
    expect(call?.answer.authorUserId).toBe('user-a');
    expect(call?.notification).toBeUndefined();
  });

  it('returns revision conflict when Answer editing loses the race', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    qaStore.findAnswer.mockResolvedValue(answer());
    qaStore.updateAnswerOwned.mockResolvedValue(null);

    await expect(
      service(qaStore, academicApi, profileApi).updateAnswer(
        'user-b',
        answerId,
        {
          expectedRevision: 1,
          body: 'Cambio concurrente',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hides Question ownership when a non-author tries to accept an Answer', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    qaStore.findQuestion.mockResolvedValue(question());

    await expect(
      service(qaStore, academicApi, profileApi).acceptAnswer(
        'user-b',
        questionId,
        answerId,
        1,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(qaStore.findAnswer).not.toHaveBeenCalled();
  });

  it('accepts the Question authors own Answer without a self-notification', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    configureProjection(academicApi, profileApi);
    qaStore.findQuestion.mockResolvedValue(question());
    qaStore.findAnswer.mockResolvedValue(answer({ authorUserId: 'user-a' }));
    qaStore.acceptAnswerAtomic.mockResolvedValue(
      question({ acceptedAnswerId: answerId, revision: 2 }),
    );

    await service(qaStore, academicApi, profileApi).acceptAnswer(
      'user-a',
      questionId,
      answerId,
      1,
    );

    const call = qaStore.acceptAnswerAtomic.mock.calls[0]?.[0];
    expect(call?.notification).toBeUndefined();
  });

  it('reports a visible Answer and normalizes optional details', async () => {
    const qaStore = store();
    const academicApi = academic();
    const profileApi = profiles();
    qaStore.findAnswer.mockResolvedValue(answer());
    qaStore.upsertPendingReport.mockImplementation((input) =>
      Promise.resolve(
        report({
          id: '55555555-5555-4555-8555-555555555555',
          targetType: input.targetType,
          targetId: input.targetId,
          reporterUserId: input.reporterUserId,
          reason: input.reason,
          details: input.details,
        }),
      ),
    );

    const result = await service(qaStore, academicApi, profileApi).reportAnswer(
      'user-a',
      answerId,
      'inappropriate',
      '  detalle   relevante  ',
    );

    expect(result.report.targetType).toBe('answer');
    expect(qaStore.upsertPendingReport).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: 'answer',
        targetId: answerId,
        reporterUserId: 'user-a',
        reason: 'inappropriate',
        details: 'detalle relevante',
      }),
    );
  });
});
