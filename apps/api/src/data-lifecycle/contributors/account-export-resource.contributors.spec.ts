import type { ResourceService } from '../../resources/domain/resource.service';
import {
  AuthoredResourcesExportContributor,
  SavedResourcesExportContributor,
} from './account-export-resource.contributors';

describe('Resource account export contributors', () => {
  it('exports authored metadata from the owner projection with stable cursor', async () => {
    const listAccountExportResources = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'resource-1',
          title: 'Apunte',
          description: null,
          tags: ['álgebra'],
          subjectId: 'subject-1',
          courseOfferingId: null,
          visibility: 'private',
          moderationState: 'hidden',
          revision: 4,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
        },
      ],
      nextCursor: 'resource-cursor',
    });
    const resources = {
      listAccountExportResources,
    } as unknown as jest.Mocked<ResourceService>;

    await expect(
      new AuthoredResourcesExportContributor(resources).readPage({
        userId: 'owner-1',
        cursor: 'after-resource',
        limit: 100,
      }),
    ).resolves.toEqual({
      records: [
        {
          id: 'resource-1',
          title: 'Apunte',
          description: null,
          tags: ['álgebra'],
          subjectId: 'subject-1',
          courseOfferingId: null,
          visibility: 'private',
          moderationState: 'hidden',
          revision: 4,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
        },
      ],
      nextCursor: 'resource-cursor',
    });
    expect(listAccountExportResources).toHaveBeenCalledWith('owner-1', {
      limit: 100,
      cursor: 'after-resource',
    });
  });

  it('exports saved references as user history without resolving target access', async () => {
    const listAccountExportSaves = jest.fn().mockResolvedValue({
      items: [
        {
          resourceId: 'resource-no-longer-readable',
          savedAt: '2026-10-03T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    const resources = {
      listAccountExportSaves,
    } as unknown as jest.Mocked<ResourceService>;

    await expect(
      new SavedResourcesExportContributor(resources).readPage({
        userId: 'owner-1',
        cursor: null,
        limit: 100,
      }),
    ).resolves.toEqual({
      records: [
        {
          resourceId: 'resource-no-longer-readable',
          savedAt: '2026-10-03T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    expect(listAccountExportSaves).toHaveBeenCalledWith('owner-1', {
      limit: 100,
      cursor: null,
    });
  });
});
