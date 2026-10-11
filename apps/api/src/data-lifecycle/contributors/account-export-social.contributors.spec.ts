import type { SocialService } from '../../social/domain/social.service';
import {
  SocialConnectionsExportContributor,
  SocialFollowingExportContributor,
} from './account-export-social.contributors';

describe('Social account export contributors', () => {
  it("exports only the owner's outgoing Follow relation", async () => {
    const listAccountExportFollowing = jest.fn().mockResolvedValue({
      items: [
        {
          followeeProfileId: 'profile-target',
          followedAt: '2026-10-01T12:00:00.000Z',
        },
      ],
      nextCursor: 'following-next',
    });
    const social = {
      listAccountExportFollowing,
    } as unknown as jest.Mocked<SocialService>;

    await expect(
      new SocialFollowingExportContributor(social).readPage({
        userId: 'owner-user',
        cursor: null,
        limit: 100,
      }),
    ).resolves.toEqual({
      records: [
        {
          followeeProfileId: 'profile-target',
          followedAt: '2026-10-01T12:00:00.000Z',
        },
      ],
      nextCursor: 'following-next',
    });
    expect(listAccountExportFollowing).toHaveBeenCalledWith('owner-user', {
      limit: 100,
      cursor: null,
    });
  });

  it("exports a Connection's owner-relative state without participant user ids", async () => {
    const listAccountExportConnections = jest.fn().mockResolvedValue({
      items: [
        {
          counterpartProfileId: 'profile-counterpart',
          status: 'pending',
          requestedByOwner: false,
          createdAt: '2026-10-01T12:00:00.000Z',
          respondedAt: null,
          updatedAt: '2026-10-01T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    const social = {
      listAccountExportConnections,
    } as unknown as jest.Mocked<SocialService>;

    const page = await new SocialConnectionsExportContributor(social).readPage({
      userId: 'owner-user',
      cursor: 'connections-after',
      limit: 100,
    });

    expect(page).toEqual({
      records: [
        {
          counterpartProfileId: 'profile-counterpart',
          status: 'pending',
          requestedByOwner: false,
          createdAt: '2026-10-01T12:00:00.000Z',
          respondedAt: null,
          updatedAt: '2026-10-01T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    expect(page.records[0]).not.toHaveProperty('userLowId');
    expect(page.records[0]).not.toHaveProperty('userHighId');
    expect(page.records[0]).not.toHaveProperty('requestedByUserId');
    expect(listAccountExportConnections).toHaveBeenCalledWith('owner-user', {
      limit: 100,
      cursor: 'connections-after',
    });
  });
});
