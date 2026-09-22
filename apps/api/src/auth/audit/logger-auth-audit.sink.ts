import { Injectable, Logger } from '@nestjs/common';

import type { AuthAuditEvent, AuthAuditSink } from './auth-audit.types';

@Injectable()
export class LoggerAuthAuditSink implements AuthAuditSink {
  private readonly logger = new Logger('AuthSecurityAudit');

  record(event: AuthAuditEvent): void {
    this.logger.log({
      event: event.event,
      userId: event.userId,
      sessionId: event.sessionId,
      clientType: event.clientType,
      occurredAt: event.occurredAt.toISOString(),
    });
  }
}
