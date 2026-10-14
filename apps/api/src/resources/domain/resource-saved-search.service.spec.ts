import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import type { SavedResourceSearchStore } from './resource-saved-search.store';
import type { ResourceService } from './resource.service';
import type { AcademicService } from '../../academic/domain/academic.service';
import { ResourceSavedSearchService } from './resource-saved-search.service';

const first = {
  createdAt: new Date('2026-10-14T12:00:00.000Z'),
  resourceId: '11111111-1111-4111-8111-111111111111',
};

function harness() {
  const saved = jest.fn().mockResolvedValue({
    items: [first],
    hasMore: true,
  });
  const get = jest.fn().mockResolvedValue({
    resource: { id: first.resourceId, title: 'Álgebra' },
  });
  const facets = jest.fn().mockResolvedValue({
    items: [
      { subjectId: '11111111-1111-4111-8111-111111111111', count: 5 },
    ],
    truncated: false,
  });
  const getCatalogNode = jest.fn().mockResolvedValue({
    node: { id: '11111111-1111-4111-8111-111111111111', name: 'Álgebra' },
  });
  const service = new ResourceSavedSearchService(
    { searchSavedResources: saved, listSavedSubjectFacets: facets } as unknown as SavedResourceSearchStore,
    { get } as unknown as ResourceService,
    { getCatalogNode } as unknown as AcademicService,
  );
  return { saved, get, facets, getCatalogNode, service };
}

describe('ResourceSavedSearchService', () => {
  it('normalizes filters and rechecks every result through ResourceService.get', async () => {
    const { saved, get, service } = harness();
    const page = await service.search('account-a', ' ÁLGEBRA   II ', 1);
    expect(page.items).toEqual([{ id: first.resourceId, title: 'Álgebra' }]);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(saved).toHaveBeenCalledWith({
      userId: 'account-a',
      q: 'álgebra ii',
      limit: 1,
    });
    expect(get).toHaveBeenCalledWith(first.resourceId, 'account-a');
  });

  it('preserves a cursor only for the original account and query', async () => {
    const { saved, service } = harness();
    const page = await service.search('account-a', 'algebra', 1);
    await service.search('account-a', 'algebra', 1, page.nextCursor ?? undefined);
    expect(saved.mock.calls[1]?.[0]).toEqual({
      userId: 'account-a',
      q: 'algebra',
      limit: 1,
      after: first,
    });
    await expect(
      service.search('account-b', 'algebra', 1, page.nextCursor ?? undefined),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.search('account-a', 'fisica', 1, page.nextCursor ?? undefined),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(saved).toHaveBeenCalledTimes(2);
  });
  it('removes unreadable resources after a concurrent privacy change', async () => {
    const { saved, get, service } = harness();
    get.mockRejectedValueOnce(new NotFoundException({ code: 'RESOURCE_NOT_FOUND' }));
    const page = await service.search('account-a', 'algebra', 25);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('supports global subject-only filtering with scoped pagination', async () => {
    const { saved, service } = harness();
    const subjectId = '11111111-1111-4111-8111-111111111111';
    const page = await service.search('account-a', undefined, 25, undefined, subjectId);
    expect(saved).toHaveBeenCalledWith({
      userId: 'account-a', subjectId, limit: 25,
    });
    expect(page.nextCursor).toEqual(expect.any(String));
    await service.search('account-a', undefined, 25, page.nextCursor ?? undefined, subjectId);
    await expect(
      service.search('account-a', undefined, 25, page.nextCursor ?? undefined,
        '22222222-2222-4222-8222-222222222222'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.search('account-a', 'algebra', 25, page.nextCursor ?? undefined, subjectId),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('resolves server-authorized saved subject names and counts', async () => {
    const { service, facets, getCatalogNode } = harness();
    const response = await service.listSubjects('account-a');
    expect(facets).toHaveBeenCalledWith('account-a');
    expect(getCatalogNode).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(response).toEqual({
      items: [{ subjectId: '11111111-1111-4111-8111-111111111111', name: 'Álgebra', count: 5 }],
      truncated: false,
    });
  });

  it('allows title-order browsing without text or Subject and preserves title cursor', async () => {
    const { saved, service } = harness();
    const titleRow = {
      ...first,
      title: 'Álgebra',
    };
    saved.mockResolvedValue({ items: [titleRow], hasMore: true });
    const firstPage = await service.search('account-a', undefined, 1, undefined, undefined, 'title');
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(saved).toHaveBeenCalledWith({
      userId: 'account-a', limit: 1, order: 'title',
    });
    await service.search('account-a', undefined, 1, firstPage.nextCursor ?? undefined, undefined, 'title');
    expect(saved).toHaveBeenLastCalledWith({
      userId: 'account-a',
      limit: 1,
      order: 'title',
      titleAfter: { title: 'Álgebra', resourceId: first.resourceId },
    });
    expect(saved).toHaveBeenCalledTimes(2);
  });

  it('keeps title sort bound to subject and text and rejects switching back to saved date', async () => {
    const { saved, service } = harness();
    const id = '22222222-2222-4222-8222-222222222222';
    saved.mockResolvedValue({
      items: [{ ...first, title: 'Bases de Datos' }],
      hasMore: true,
    });
    const firstPage = await service.search('account-a', 'PARCIAL', 1, undefined, id, 'title');
    expect(saved).toHaveBeenCalledWith({
      userId: 'account-a', q: 'parcial', subjectId: id, limit: 1, order: 'title',
    });
    const cursor = firstPage.nextCursor ?? undefined;
    for (const [query, subject, order] of [
      ['otro', id, 'title'],
      ['PARCIAL', undefined, 'title'],
      ['PARCIAL', id, 'saved'],
    ] as const) {
      await expect(
        service.search('account-a', query, 1, cursor, subject, order),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('does not emit a broken title cursor if a store omits the sort key', async () => {
    const { saved, service } = harness();
    await expect(
      service.search('account-a', 'resumen', 1, undefined, undefined, 'title'),
    ).rejects.toThrow('Saved title pagination is unavailable');
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('rejects a normalized one-character or blank query without reading saves', async () => {
    const { saved, service } = harness();
    for (const q of [' ', ' a ', '   ', '']) {
      await expect(service.search('account-a', q, 25)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    }
    expect(saved).not.toHaveBeenCalled();
  });

  it('rejects an invalid cursor without querying saved state', async () => {
    const { saved, service } = harness();
    await expect(
      service.search('account-a', 'algebra', 25, 'not-a-valid-cursor'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(saved).not.toHaveBeenCalled();
  });

});
