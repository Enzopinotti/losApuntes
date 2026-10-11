import type { OrganizationService } from '../../organizations/domain/organization.service';
import {
  OrganizationAuthoredLinksExportContributor,
  OrganizationFeaturedResourcesExportContributor,
} from './account-export-organization-curation.contributors';

describe('Organization curation account export contributors', () => {
  it('exports current owner-authored links with opaque Organization references', async () => {
    const organizations = {
      listAccountExportAuthoredLinks: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'link-1',
            organizationId: 'organization-1',
            label: 'Community site',
            url: 'https://example.test',
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-02T00:00:00.000Z',
          },
        ],
        nextCursor: 'cursor-2',
      }),
    } as unknown as jest.Mocked<OrganizationService>;

    const page = await new OrganizationAuthoredLinksExportContributor(
      organizations,
    ).readPage({ userId: 'owner-1', cursor: 'cursor-1', limit: 25 });

    expect(organizations.listAccountExportAuthoredLinks.mock.calls).toEqual([
      ['owner-1', { limit: 25, cursor: 'cursor-1' }],
    ]);
    expect(page).toEqual({
      records: [
        {
          id: 'link-1',
          organizationId: 'organization-1',
          label: 'Community site',
          url: 'https://example.test',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
        },
      ],
      nextCursor: 'cursor-2',
    });
    expect(page.records[0]).not.toHaveProperty('createdByUserId');
  });

  it('exports featured Resource references without resolving or copying Resources', async () => {
    const organizations = {
      listAccountExportFeaturedResources: jest.fn().mockResolvedValue({
        items: [
          {
            organizationId: 'organization-1',
            resourceId: 'resource-1',
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-02T00:00:00.000Z',
          },
        ],
        nextCursor: null,
      }),
    } as unknown as jest.Mocked<OrganizationService>;

    const page = await new OrganizationFeaturedResourcesExportContributor(
      organizations,
    ).readPage({ userId: 'curator-1', cursor: null, limit: 10 });

    expect(organizations.listAccountExportFeaturedResources.mock.calls).toEqual(
      [['curator-1', { limit: 10, cursor: null }]],
    );
    expect(page).toEqual({
      records: [
        {
          organizationId: 'organization-1',
          resourceId: 'resource-1',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    expect(page.records[0]).not.toHaveProperty('title');
    expect(page.records[0]).not.toHaveProperty('content');
    expect(page.records[0]).not.toHaveProperty('createdByUserId');
  });
});
