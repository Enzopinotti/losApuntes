import { UnprocessableEntityException } from '@nestjs/common';

import { encodeMineCursor } from './qa-mine-cursor';
import { QaService } from './qa.service';
import type { QuestionRecord } from './qa.types';

const subjectId = '11111111-1111-4111-8111-111111111111';
const questionId = '22222222-2222-4222-8222-222222222222';
const updatedAt = new Date('2026-10-19T18:00:00.000Z');

function setup(rows: QuestionRecord[] = [], hasMore = false) {
  const searchQuestions = jest.fn().mockResolvedValue({ items: rows, hasMore });
  const store = { searchQuestions };
  const resolveResourceContext = jest
    .fn()
    .mockResolvedValue({ subjectId });
  const getCatalogNode = jest.fn().mockResolvedValue({
    node: { id: subjectId, name: 'Base de Datos' },
  });
  const getAttributionForUser = jest.fn().mockResolvedValue({
    profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    displayName: 'Autora',
    avatarUrl: null,
  });
  const academic = { resolveResourceContext, getCatalogNode };
  const profiles = { getAttributionForUser };
  const service = new QaService(
    store as never,
    academic as never,
    profiles as never,
    {} as never,
  );
  return { service, searchQuestions, academic, profiles };
}

function question(): QuestionRecord {
  return {
    id: questionId,
    authorUserId: 'owner-a',
    subjectId,
    courseOfferingId: null,
    title: 'Problema de normalización',
    body: '¿Cómo trabajo esta dependencia funcional?',
    searchText: 'problema de normalización dependencia funcional',
    state: 'open',
    moderationState: 'available',
    answerCount: 2,
    acceptedAnswerId: null,
    revision: 3,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('B145 own questions service', () => {
  it('requires author scoped query and preserves normal question projection', async () => {
    const { service, searchQuestions } = setup([question()], true);
    const page = await service.mine('owner-a', {
      limit: 10,
      q: 'normalización',
      subjectId,
      status: 'open',
    });

    expect(searchQuestions).toHaveBeenCalledWith({
      authorUserId: 'owner-a',
      q: 'normalización',
      subjectId,
      state: 'open',
      limit: 10,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: questionId,
      state: 'open',
      answerCount: 2,
      viewer: { canEdit: true, canAcceptAnswers: true },
    });
    expect(JSON.stringify(page)).not.toContain('owner-a');
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.nextCursor).not.toContain('owner-a');
  });

  it('returns an empty page and never asks for any other author', async () => {
    const { service, searchQuestions, profiles } = setup();
    await expect(service.mine('owner-b', { limit: 25 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(searchQuestions).toHaveBeenCalledWith({
      authorUserId: 'owner-b',
      limit: 25,
    });
    expect(profiles.getAttributionForUser).not.toHaveBeenCalled();
  });

  it('rejects cross-account cursors before touching storage', async () => {
    const { service, searchQuestions } = setup();
    const cursor = encodeMineCursor('owner-a', { id: questionId, updatedAt });
    await expect(
      service.mine('owner-b', { limit: 25, cursor }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(searchQuestions).not.toHaveBeenCalled();
  });

  it('rejects impossible paging and missing principal before touching storage', async () => {
    const { service, searchQuestions } = setup();
    for (const limit of [0, 51, 1.5, Number.NaN]) {
      await expect(
        service.mine('owner-a', { limit }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    await expect(
      service.mine('', { limit: 25 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(searchQuestions).not.toHaveBeenCalled();
  });

  it('propagates datastore errors rather than masking them as empty results', async () => {
    const { service, searchQuestions } = setup();
    searchQuestions.mockRejectedValue(new Error('database-unavailable'));
    await expect(service.mine('owner-a', { limit: 25 })).rejects.toThrow(
      'database-unavailable',
    );
  });
});
