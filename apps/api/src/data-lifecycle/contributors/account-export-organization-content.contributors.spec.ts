import type { OrganizationService } from '../../organizations/domain/organization.service';
import {
  OrganizationAuthoredEventsExportContributor,
  OrganizationAuthoredPostsExportContributor,
} from './account-export-organization-content.contributors';

describe('Organization authored content account export contributors', () => {
  it('exports owner-authored Post content with only a stable Organization reference', async () => {
    const listAccountExportAuthoredPosts = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'post-id',
          organizationId: 'organization-id',
          title: 'Owner title',
          body: 'Owner-authored body',
          subjectId: 'subject-id',
          publishedAt: '2026-10-11T12:00:00.000Z',
          createdAt: '2026-10-11T11:00:00.000Z',
          updatedAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'posts-next',
    });
    const organizations = {
      listAccountExportAuthoredPosts,
    } as unknown as jest.Mocked<OrganizationService>;

    const page = await new OrganizationAuthoredPostsExportContributor(
      organizations,
    ).readPage({ userId: 'owner-user', cursor: null, limit: 100 });

    expect(page).toEqual({
      records: [
        {
          id: 'post-id',
          organizationId: 'organization-id',
          title: 'Owner title',
          body: 'Owner-authored body',
          subjectId: 'subject-id',
          publishedAt: '2026-10-11T12:00:00.000Z',
          createdAt: '2026-10-11T11:00:00.000Z',
          updatedAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'posts-next',
    });
    expect(page.records[0]).not.toHaveProperty('createdByUserId');
    expect(page.records[0]).not.toHaveProperty('moderationState');
    expect(page.records[0]).not.toHaveProperty('revision');
    expect(listAccountExportAuthoredPosts).toHaveBeenCalledWith('owner-user', {
      limit: 100,
      cursor: null,
    });
  });

  it('exports owner-authored Event details and user-facing state without moderation data', async () => {
    const listAccountExportAuthoredEvents = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'event-id',
          organizationId: 'organization-id',
          title: 'Owner event',
          description: 'Event details',
          startsAt: '2026-10-12T12:00:00.000Z',
          endsAt: null,
          locationLabel: null,
          externalUrl: 'https://events.example.test/ticket',
          state: 'cancelled',
          createdAt: '2026-10-10T11:00:00.000Z',
          updatedAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    const organizations = {
      listAccountExportAuthoredEvents,
    } as unknown as jest.Mocked<OrganizationService>;

    const page = await new OrganizationAuthoredEventsExportContributor(
      organizations,
    ).readPage({ userId: 'owner-user', cursor: 'events-after', limit: 25 });

    expect(page).toEqual({
      records: [
        {
          id: 'event-id',
          organizationId: 'organization-id',
          title: 'Owner event',
          description: 'Event details',
          startsAt: '2026-10-12T12:00:00.000Z',
          endsAt: null,
          locationLabel: null,
          externalUrl: 'https://events.example.test/ticket',
          state: 'cancelled',
          createdAt: '2026-10-10T11:00:00.000Z',
          updatedAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    expect(page.records[0]).not.toHaveProperty('createdByUserId');
    expect(page.records[0]).not.toHaveProperty('moderationState');
    expect(page.records[0]).not.toHaveProperty('revision');
    expect(listAccountExportAuthoredEvents).toHaveBeenCalledWith('owner-user', {
      limit: 25,
      cursor: 'events-after',
    });
  });
});
