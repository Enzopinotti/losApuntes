import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import type { NotificationService } from './domain/notification.service';
import { NotificationsController } from './notifications.controller';

describe('B144 private notification unread counter HTTP', () => {
  it('is a dedicated authenticated GET with no-store caching', () => {
    const route = Reflect.get(
      NotificationsController.prototype,
      'countUnread',
    ) as object;

    expect(Reflect.getMetadata(PATH_METADATA, route)).toBe('unread-count');
    expect(Reflect.getMetadata(METHOD_METADATA, route)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, NotificationsController)).toEqual([
      AuthSessionGuard,
    ]);
    expect(Reflect.getMetadata(HEADERS_METADATA, route)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('uses only the authenticated user ID and exposes only a count', async () => {
    const countUnread = jest.fn().mockResolvedValue({ unreadCount: 4 });
    const controller = new NotificationsController({
      countUnread,
    } as unknown as NotificationService);
    const request = { user: { id: 'owner-a' } } as AuthenticatedRequest;

    await expect(controller.countUnread(request)).resolves.toEqual({
      unreadCount: 4,
    });
    expect(countUnread).toHaveBeenCalledTimes(1);
    expect(countUnread).toHaveBeenCalledWith('owner-a');
  });

  it('returns a zero count without loading notification rows or profiles', async () => {
    const countUnread = jest.fn().mockResolvedValue({ unreadCount: 0 });
    const list = jest.fn();
    const controller = new NotificationsController({
      countUnread,
      list,
    } as unknown as NotificationService);
    const request = { user: { id: 'owner-b' } } as AuthenticatedRequest;

    await expect(controller.countUnread(request)).resolves.toEqual({
      unreadCount: 0,
    });
    expect(list).not.toHaveBeenCalled();
  });

  it('propagates database errors rather than reporting a fake zero count', async () => {
    const countUnread = jest.fn().mockRejectedValue(new Error('database-down'));
    const controller = new NotificationsController({
      countUnread,
    } as unknown as NotificationService);
    const request = { user: { id: 'owner-c' } } as AuthenticatedRequest;

    await expect(controller.countUnread(request)).rejects.toThrow(
      'database-down',
    );
  });
});
