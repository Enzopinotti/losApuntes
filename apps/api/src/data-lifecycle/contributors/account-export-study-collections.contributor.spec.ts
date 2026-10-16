import { StudyCollectionExportReader } from '../../study-collections/mongo/study-collection-export.reader';
import { StudyCollectionsExportContributor } from './account-export-study-collections.contributor';

const owner = 'owner-account-only';

describe('StudyCollectionsExportContributor — owner-scoped v2', () => {
  it('emits only allowlisted owner fields and forwards bounded pagination unchanged', async () => {
    const reader = {
      listAccountExportCollections: jest.fn().mockResolvedValue({
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            title: 'Parcial',
            description: null,
            resourceIds: ['22222222-2222-4222-8222-222222222222'],
            revision: 2,
            createdAt: '2026-10-01T12:00:00.000Z',
            updatedAt: '2026-10-02T12:00:00.000Z',
            operationKey: 'hidden',
            ownerUserId: owner,
          },
        ],
        nextCursor: 'continuation',
      }),
    };
    const adapter = new StudyCollectionsExportContributor(
      reader as unknown as StudyCollectionExportReader,
    );
    const page = await adapter.readPage({
      userId: owner,
      cursor: null,
      limit: 100,
    });
    expect(adapter.sectionId).toBe('study.collections');
    expect(reader.listAccountExportCollections).toHaveBeenCalledWith(owner, {
      cursor: null,
      limit: 100,
    });
    expect(page).toEqual({
      records: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Parcial',
          description: null,
          resourceIds: ['22222222-2222-4222-8222-222222222222'],
          revision: 2,
          createdAt: '2026-10-01T12:00:00.000Z',
          updatedAt: '2026-10-02T12:00:00.000Z',
        },
      ],
      nextCursor: 'continuation',
    });
    expect(JSON.stringify(page)).not.toContain('owner-account-only');
    expect(JSON.stringify(page)).not.toContain('hidden');
  });

  it('propagates reader failures rather than silently publishing a partial export', async () => {
    const reader = {
      listAccountExportCollections: jest
        .fn()
        .mockRejectedValue(new Error('persistence unavailable')),
    };
    const adapter = new StudyCollectionsExportContributor(
      reader as unknown as StudyCollectionExportReader,
    );
    await expect(
      adapter.readPage({ userId: owner, cursor: null, limit: 100 }),
    ).rejects.toThrow('persistence unavailable');
  });
});
