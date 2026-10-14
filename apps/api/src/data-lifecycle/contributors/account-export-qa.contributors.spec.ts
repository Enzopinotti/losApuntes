import type { QaService } from '../../qa/domain/qa.service';
import {
  AuthoredAnswersExportContributor,
  AuthoredQuestionsExportContributor,
} from './account-export-qa.contributors';

describe('Q&A account export contributors', () => {
  it("exports the owner's question content and academic context", async () => {
    const listAccountExportQuestions = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'question-1',
          subjectId: 'subject-1',
          courseOfferingId: 'offering-1',
          title: 'Normalization',
          body: 'How do I remove transitive dependencies?',
          state: 'open',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
        },
      ],
      nextCursor: 'questions-next',
    });
    const qa = {
      listAccountExportQuestions,
    } as unknown as jest.Mocked<QaService>;

    await expect(
      new AuthoredQuestionsExportContributor(qa).readPage({
        userId: 'owner-1',
        cursor: null,
        limit: 100,
      }),
    ).resolves.toEqual({
      records: [
        {
          id: 'question-1',
          subjectId: 'subject-1',
          courseOfferingId: 'offering-1',
          title: 'Normalization',
          body: 'How do I remove transitive dependencies?',
          state: 'open',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
        },
      ],
      nextCursor: 'questions-next',
    });
    expect(listAccountExportQuestions).toHaveBeenCalledWith('owner-1', {
      limit: 100,
      cursor: null,
    });
  });

  it("exports only the owner's answer and its Question reference", async () => {
    const listAccountExportAnswers = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'answer-1',
          questionId: 'question-by-someone-else',
          body: 'Use a decomposition that preserves dependencies.',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    const qa = {
      listAccountExportAnswers,
    } as unknown as jest.Mocked<QaService>;

    await expect(
      new AuthoredAnswersExportContributor(qa).readPage({
        userId: 'owner-1',
        cursor: 'answers-after',
        limit: 100,
      }),
    ).resolves.toEqual({
      records: [
        {
          id: 'answer-1',
          questionId: 'question-by-someone-else',
          body: 'Use a decomposition that preserves dependencies.',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    expect(listAccountExportAnswers).toHaveBeenCalledWith('owner-1', {
      limit: 100,
      cursor: 'answers-after',
    });
  });
});
