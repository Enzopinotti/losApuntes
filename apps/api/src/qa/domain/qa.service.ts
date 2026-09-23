import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AcademicService } from '../../academic/domain/academic.service';
import { ProfileService } from '../../profile/domain/profile.service';
import type {
  CreateAnswerDto,
  CreateQuestionDto,
  QuestionSearchDto,
  UpdateAnswerDto,
  UpdateQuestionDto,
} from '../dto/qa.dto';
import { QA_STORE, type QaStore } from './qa.store';
import type { AnswerRecord, QuestionCursor, QuestionRecord } from './qa.types';

function cleanText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function normalizedSearchText(title: string, body: string): string {
  return cleanText(title + ' ' + body)
    .normalize('NFKC')
    .toLocaleLowerCase('es-AR');
}

function encodeCursor(cursor: QuestionCursor): string {
  return Buffer.from(
    JSON.stringify({
      updatedAt: cursor.updatedAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(value?: string): QuestionCursor | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    if (typeof parsed.updatedAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('invalid cursor');
    }

    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) throw new Error('invalid date');

    return { updatedAt, id: parsed.id };
  } catch {
    throw new UnprocessableEntityException({
      code: 'QUESTION_CURSOR_INVALID',
      message: 'Question cursor is invalid',
    });
  }
}

@Injectable()
export class QaService {
  constructor(
    @Inject(QA_STORE)
    private readonly store: QaStore,
    private readonly academic: AcademicService,
    private readonly profiles: ProfileService,
  ) {}

  async search(dto: QuestionSearchDto) {
    const subjectId = dto.subjectId
      ? (await this.academic.resolveResourceContext(dto.subjectId)).subjectId
      : undefined;
    const result = await this.store.searchQuestions({
      ...(dto.q ? { q: cleanText(dto.q).toLocaleLowerCase('es-AR') } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(dto.status ? { state: dto.status } : {}),
      limit: dto.limit,
      after: decodeCursor(dto.cursor),
    });
    const last = result.items.at(-1);

    return {
      items: await Promise.all(
        result.items.map((row) => this.questionProjection(row)),
      ),
      nextCursor:
        result.hasMore && last
          ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
          : null,
    };
  }

  async get(id: string, viewerUserId?: string) {
    const question = await this.requireVisibleQuestion(id);
    const answers = await this.store.listAnswers(id, 100);

    return {
      question: await this.questionProjection(question, viewerUserId),
      answers: await Promise.all(
        answers.map((answer) => this.answerProjection(answer, viewerUserId)),
      ),
    };
  }

  async create(userId: string, dto: CreateQuestionDto) {
    await this.requireActorProfile(userId);
    const context = await this.academic.resolveResourceContext(
      dto.subjectId,
      dto.courseOfferingId,
    );
    const title = cleanText(dto.title);
    const body = cleanText(dto.body);
    const created = await this.store.createQuestion({
      id: randomUUID(),
      authorUserId: userId,
      subjectId: context.subjectId,
      courseOfferingId: context.courseOfferingId,
      title,
      body,
      searchText: normalizedSearchText(title, body),
      state: 'open',
      moderationState: 'available',
      answerCount: 0,
      acceptedAnswerId: null,
      revision: 1,
    });

    return { question: await this.questionProjection(created) };
  }

  async update(userId: string, id: string, dto: UpdateQuestionDto) {
    const existing = await this.requireVisibleQuestion(id);
    if (existing.authorUserId !== userId) this.questionNotFound();

    const title =
      dto.title === undefined ? existing.title : cleanText(dto.title);
    const body = dto.body === undefined ? existing.body : cleanText(dto.body);
    const patch = {
      ...(dto.title === undefined ? {} : { title }),
      ...(dto.body === undefined ? {} : { body }),
      ...(dto.status === undefined ? {} : { state: dto.status }),
      ...(dto.title === undefined && dto.body === undefined
        ? {}
        : { searchText: normalizedSearchText(title, body) }),
    };

    if (Object.keys(patch).length === 0) {
      throw new UnprocessableEntityException({
        code: 'QUESTION_UPDATE_EMPTY',
        message: 'Question update contains no changes',
      });
    }

    const updated = await this.store.updateQuestionOwned(
      id,
      userId,
      dto.expectedRevision,
      patch,
    );

    if (!updated) {
      throw new ConflictException({
        code: 'QUESTION_REVISION_CONFLICT',
        message: 'Question changed concurrently',
      });
    }

    return { question: await this.questionProjection(updated) };
  }

  async createAnswer(userId: string, questionId: string, dto: CreateAnswerDto) {
    await this.requireActorProfile(userId);
    const question = await this.requireVisibleQuestion(questionId);

    if (question.state !== 'open') {
      throw new ConflictException({
        code: 'QUESTION_CLOSED',
        message: 'Question is closed',
      });
    }

    const answerId = randomUUID();
    const created = await this.store.createAnswerAtomic({
      answer: {
        id: answerId,
        questionId,
        authorUserId: userId,
        body: cleanText(dto.body),
        moderationState: 'available',
        revision: 1,
      },
      ...(question.authorUserId !== userId
        ? {
            notification: {
              id: randomUUID(),
              userId: question.authorUserId,
              type: 'qa.question_answered' as const,
              actorUserId: userId,
              targetType: 'question' as const,
              targetId: questionId,
              readAt: null,
            },
          }
        : {}),
    });

    if (!created) {
      throw new ConflictException({
        code: 'QUESTION_CLOSED',
        message: 'Question changed before the answer could be created',
      });
    }

    return { answer: await this.answerProjection(created) };
  }

  async updateAnswer(userId: string, id: string, dto: UpdateAnswerDto) {
    const existing = await this.requireVisibleAnswer(id);
    if (existing.authorUserId !== userId) this.answerNotFound();

    const updated = await this.store.updateAnswerOwned(
      id,
      userId,
      dto.expectedRevision,
      cleanText(dto.body),
    );

    if (!updated) {
      throw new ConflictException({
        code: 'ANSWER_REVISION_CONFLICT',
        message: 'Answer changed concurrently',
      });
    }

    return { answer: await this.answerProjection(updated) };
  }

  async acceptAnswer(
    userId: string,
    questionId: string,
    answerId: string,
    expectedRevision: number,
  ) {
    const question = await this.requireVisibleQuestion(questionId);
    if (question.authorUserId !== userId) this.questionNotFound();

    const answer = await this.requireVisibleAnswer(answerId);
    if (answer.questionId !== questionId) {
      throw new UnprocessableEntityException({
        code: 'ANSWER_QUESTION_MISMATCH',
        message: 'Answer does not belong to this Question',
      });
    }

    const updated = await this.store.acceptAnswerAtomic({
      questionId,
      answerId,
      authorUserId: userId,
      expectedRevision,
      ...(answer.authorUserId !== userId
        ? {
            notification: {
              id: randomUUID(),
              userId: answer.authorUserId,
              type: 'qa.answer_accepted' as const,
              actorUserId: userId,
              targetType: 'question' as const,
              targetId: questionId,
              readAt: null,
            },
          }
        : {}),
    });

    if (!updated) {
      throw new ConflictException({
        code: 'QUESTION_REVISION_CONFLICT',
        message: 'Question or Answer changed concurrently',
      });
    }

    return { question: await this.questionProjection(updated) };
  }

  async reportQuestion(
    userId: string,
    id: string,
    reason: Parameters<QaStore['upsertPendingReport']>[0]['reason'],
    details?: string | null,
  ) {
    await this.requireVisibleQuestion(id);
    return this.report(userId, 'question', id, reason, details);
  }

  async reportAnswer(
    userId: string,
    id: string,
    reason: Parameters<QaStore['upsertPendingReport']>[0]['reason'],
    details?: string | null,
  ) {
    await this.requireVisibleAnswer(id);
    return this.report(userId, 'answer', id, reason, details);
  }

  private async report(
    userId: string,
    targetType: 'question' | 'answer',
    targetId: string,
    reason: Parameters<QaStore['upsertPendingReport']>[0]['reason'],
    details?: string | null,
  ) {
    const row = await this.store.upsertPendingReport({
      id: randomUUID(),
      targetType,
      targetId,
      reporterUserId: userId,
      reason,
      details: details == null ? null : cleanText(details),
    });

    return {
      report: {
        id: row.id,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      },
    };
  }

  private async requireActorProfile(userId: string) {
    const actor = await this.profiles.getAttributionForUser(userId);
    if (!actor) {
      throw new UnprocessableEntityException({
        code: 'QA_PROFILE_REQUIRED',
        message: 'Create a Profile before contributing to Q&A',
      });
    }
    return actor;
  }

  private async requireVisibleQuestion(id: string): Promise<QuestionRecord> {
    const row = await this.store.findQuestion(id);
    if (!row || row.moderationState !== 'available') this.questionNotFound();
    return row;
  }

  private async requireVisibleAnswer(id: string): Promise<AnswerRecord> {
    const row = await this.store.findAnswer(id);
    if (!row || row.moderationState !== 'available') this.answerNotFound();
    return row;
  }

  private async questionProjection(row: QuestionRecord, viewerUserId?: string) {
    const [author, subject, offering] = await Promise.all([
      this.profiles.getAttributionForUser(row.authorUserId),
      this.academic.getCatalogNode(row.subjectId),
      row.courseOfferingId
        ? this.academic.getCatalogNode(row.courseOfferingId)
        : Promise.resolve(null),
    ]);

    return {
      id: row.id,
      author,
      academic: {
        subject: { id: subject.node.id, name: subject.node.name },
        courseOffering: offering
          ? { id: offering.node.id, name: offering.node.name }
          : null,
      },
      title: row.title,
      body: row.body,
      state: row.state,
      answerCount: row.answerCount,
      acceptedAnswerId: row.acceptedAnswerId,
      revision: row.revision,
      viewer: {
        canEdit: row.authorUserId === viewerUserId,
        canAnswer: Boolean(viewerUserId) && row.state === 'open',
        canAcceptAnswers: row.authorUserId === viewerUserId,
        canReport: Boolean(viewerUserId),
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async answerProjection(row: AnswerRecord, viewerUserId?: string) {
    return {
      id: row.id,
      questionId: row.questionId,
      author: await this.profiles.getAttributionForUser(row.authorUserId),
      body: row.body,
      revision: row.revision,
      viewer: {
        canEdit: row.authorUserId === viewerUserId,
        canReport: Boolean(viewerUserId),
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private questionNotFound(): never {
    throw new NotFoundException({
      code: 'QUESTION_NOT_FOUND',
      message: 'Question was not found',
    });
  }

  private answerNotFound(): never {
    throw new NotFoundException({
      code: 'ANSWER_NOT_FOUND',
      message: 'Answer was not found',
    });
  }
}
