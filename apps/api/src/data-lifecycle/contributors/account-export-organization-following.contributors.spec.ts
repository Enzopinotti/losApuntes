import type { OrganizationService } from '../../organizations/domain/organization.service';
import { OrganizationFollowingExportContributor } from './account-export-organization-following.contributors';

describe('Organization following account export contributor', () => {
  it("exports only the owner's current organization follow references", async () => {
    const listAccountExportFollowing = jest.fn().mockResolvedValue({
      items: [
        {
          organizationId: 'organization-stable-id',
          followedAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'following-next',
    });
    const organizations = {
      listAccountExportFollowing,
    } as unknown as jest.Mocked<OrganizationService>;

    const page = await new OrganizationFollowingExportContributor(
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
          followedAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'following-next',
    });
    expect(page.records[0]).not.toHaveProperty('userId');
    expect(page.records[0]).not.toHaveProperty('name');
    expect(page.records[0]).not.toHaveProperty('members');
    expect(listAccountExportFollowing).toHaveBeenCalledWith('owner-user', {
      limit: 100,
      cursor: null,
    });
  });
});
