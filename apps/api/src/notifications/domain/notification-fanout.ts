import { UnprocessableEntityException } from '@nestjs/common';

import type { CreateNotificationRecord } from './notification.types';

export const MAX_NOTIFICATION_SYNC_RECIPIENTS = 50;
export const MAX_NOTIFICATION_SYNC_RECORDS = 50;

export function assertNotificationFanoutBudget(
  records: readonly CreateNotificationRecord[],
): void {
  const recipients = new Set(records.map((record) => record.userId));

  if (
    recipients.size > MAX_NOTIFICATION_SYNC_RECIPIENTS ||
    records.length > MAX_NOTIFICATION_SYNC_RECORDS
  ) {
    throw new UnprocessableEntityException({
      code: 'NOTIFICATION_FANOUT_BUDGET_EXCEEDED',
      message:
        'Synchronous notification fan-out exceeds the configured recipient budget',
      maxRecipients: MAX_NOTIFICATION_SYNC_RECIPIENTS,
      maxRecords: MAX_NOTIFICATION_SYNC_RECORDS,
    });
  }
}
