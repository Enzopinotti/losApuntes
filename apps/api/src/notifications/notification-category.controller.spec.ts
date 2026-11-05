import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import type { NotificationCategoryService } from './domain/notification-category.service';
import { NotificationCategoryPageDto } from './dto/notification-category.dto';
import { NotificationCategoryController } from './notification-category.controller';
import { NotificationSchema } from './mongo/notification.mongo-schema';
import './notifications.module';

describe('B149 private category notifications HTTP', () => {
  it('requires Auth and no-store on the static count and category list routes', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, NotificationCategoryController),
    ).toBe('notifications/categories');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, NotificationCategoryController),
    ).toEqual([AuthSessionGuard]);
    for (const [methodName, path] of [
      ['unreadCounts', 'unread-counts'],
      ['list', ':category'],
    ]) {
      const method = Reflect.get(
        NotificationCategoryController.prototype,
        methodName,
      ) as object;
      expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
        RequestMethod.GET,
      );
      expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
        name: 'Cache-Control',
        value: 'private, no-store',
      });
    }
  });

  it('uses the authenticated owner, never a client supplied account ID', async () => {
    const list = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const unreadCounts = jest
      .fn()
      .mockResolvedValue({ socialUnreadCount: 0, qaUnreadCount: 2 });
    const controller = new NotificationCategoryController({
      list,
      unreadCounts,
    } as unknown as NotificationCategoryService);
    const request = { user: { id: 'owner-a' } } as AuthenticatedRequest;
    const dto = new NotificationCategoryPageDto();

    await expect(controller.list(request, 'qa', dto)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(list).toHaveBeenCalledWith('owner-a', 'qa', dto);
    await expect(controller.unreadCounts(request)).resolves.toEqual({
      socialUnreadCount: 0,
      qaUnreadCount: 2,
    });
    expect(unreadCounts).toHaveBeenCalledWith('owner-a');
  });

  it('validates boolean filters, numeric page budget and cursor maximum', () => {
    const defaults = new NotificationCategoryPageDto();
    expect(defaults.unreadOnly).toBe(false);
    expect(defaults.limit).toBe(30);
    expect(validateSync(defaults)).toHaveLength(0);
    const valid = plainToInstance(NotificationCategoryPageDto, {
      unreadOnly: 'true',
      limit: '15',
    });
    expect(valid.unreadOnly).toBe(true);
    expect(valid.limit).toBe(15);
    expect(validateSync(valid)).toHaveLength(0);
    const invalid = plainToInstance(NotificationCategoryPageDto, {
      unreadOnly: 'yes',
      limit: '31',
      cursor: 'x'.repeat(513),
    });
    expect(validateSync(invalid)).not.toHaveLength(0);
  });

  it('registers owner-category paging indexes before the module compiles them', () => {
    expect(NotificationSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ userId: 1, type: 1, createdAt: -1, id: 1 }, { background: true }],
        [
          { userId: 1, type: 1, readAt: 1, createdAt: -1, id: 1 },
          { background: true },
        ],
      ]),
    );
  });

  it('keeps service failures visible instead of fabricating an empty inbox', async () => {
    const list = jest.fn().mockRejectedValue(new Error('storage-down'));
    const controller = new NotificationCategoryController({
      list,
    } as unknown as NotificationCategoryService);
    await expect(
      controller.list(
        { user: { id: 'owner-a' } } as AuthenticatedRequest,
        'qa',
        new NotificationCategoryPageDto(),
      ),
    ).rejects.toThrow('storage-down');
  });
});
