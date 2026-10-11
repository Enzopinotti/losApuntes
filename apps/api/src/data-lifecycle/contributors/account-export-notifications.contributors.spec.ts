import type { NotificationService } from '../../notifications/domain/notification.service';
import { NotificationInboxExportContributor } from './account-export-notifications.contributors';

describe('Notification inbox account export contributor', () => {
  it("exports only the owner's notification state and target reference", async () => {
    const listAccountExportNotifications = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'notification-1',
          type: 'qa.answer_accepted',
          actorProfileId: 'actor-profile',
          targetType: 'question',
          targetId: 'question-1',
          readAt: null,
          createdAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'inbox-next',
    });
    const notifications = {
      listAccountExportNotifications,
    } as unknown as jest.Mocked<NotificationService>;

    const page = await new NotificationInboxExportContributor(
      notifications,
    ).readPage({
      userId: 'owner-user',
      cursor: null,
      limit: 100,
    });

    expect(page).toEqual({
      records: [
        {
          id: 'notification-1',
          type: 'qa.answer_accepted',
          actorProfileId: 'actor-profile',
          targetType: 'question',
          targetId: 'question-1',
          readAt: null,
          createdAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'inbox-next',
    });
    expect(page.records[0]).not.toHaveProperty('userId');
    expect(page.records[0]).not.toHaveProperty('actorUserId');
    expect(page.records[0]).not.toHaveProperty('title');
    expect(listAccountExportNotifications).toHaveBeenCalledWith('owner-user', {
      limit: 100,
      cursor: null,
    });
  });
});
