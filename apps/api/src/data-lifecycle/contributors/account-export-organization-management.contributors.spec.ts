import type { OrganizationService } from '../../organizations/domain/organization.service';
import { OrganizationManagementExportContributor } from './account-export-organization-management.contributors';

describe('Organization management account export contributor', () => {
  it("exports only the owner's current management role and stable reference", async () => {
    const listAccountExportManagement = jest.fn().mockResolvedValue({
      items: [
        {
          organizationId: 'organization-stable-id',
          role: 'editor',
          createdAt: '2026-10-10T12:00:00.000Z',
          updatedAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'management-next',
    });
    const organizations = {
      listAccountExportManagement,
    } as unknown as jest.Mocked<OrganizationService>;

    const page = await new OrganizationManagementExportContributor(
      organizations,
    ).readPage({
      userId: 'owner-user',
      cursor: null,
      limit: 100,
    });

    expect(page).toEqual({
      records: [
        {
          organizationId: 'organization-stable-id',
          role: 'editor',
          createdAt: '2026-10-10T12:00:00.000Z',
          updatedAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'management-next',
    });
    expect(page.records[0]).not.toHaveProperty('userId');
    expect(page.records[0]).not.toHaveProperty('name');
    expect(page.records[0]).not.toHaveProperty('managers');
    expect(page.records[0]).not.toHaveProperty('managementRevision');
    expect(listAccountExportManagement).toHaveBeenCalledWith('owner-user', {
      limit: 100,
      cursor: null,
    });
  });
});
