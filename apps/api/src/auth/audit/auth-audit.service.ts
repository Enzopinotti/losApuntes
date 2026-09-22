import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  AUTH_AUDIT_SINK,
  type AuthAuditEvent,
  type AuthAuditSink,
} from './auth-audit.types';

@Injectable()
export class AuthAuditService {
  private readonly logger = new Logger(AuthAuditService.name);

  constructor(
    @Inject(AUTH_AUDIT_SINK)
    private readonly sink: AuthAuditSink,
  ) {}

  async record(
    event: Omit<AuthAuditEvent, 'occurredAt'> & { occurredAt?: Date },
  ): Promise<void> {
    try {
      await this.sink.record({
        ...event,
        occurredAt: event.occurredAt ?? new Date(),
      });
    } catch {
      this.logger.warn('auth.audit.sink_failed');
    }
  }
}
