import { Logger } from '@nestjs/common';

import type { AuthAuditEvent } from './auth-audit.types';
import { LoggerAuthAuditSink } from './logger-auth-audit.sink';

describe('LoggerAuthAuditSink', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs only the bounded security-event allow-list', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const sink = new LoggerAuthAuditSink();
    const occurredAt = new Date('2026-09-22T16:45:00.000Z');

    sink.record({
      event: 'auth.password.changed',
      userId: 'user-1',
      sessionId: 'session-1',
      clientType: 'web',
      occurredAt,
      password: 'must-never-log',
      sessionToken: 'must-never-log',
      tokenHash: 'must-never-log',
      cookie: 'must-never-log',
    } as unknown as AuthAuditEvent);

    expect(log).toHaveBeenCalledWith({
      event: 'auth.password.changed',
      userId: 'user-1',
      sessionId: 'session-1',
      clientType: 'web',
      occurredAt: occurredAt.toISOString(),
    });

    const payload = JSON.stringify(log.mock.calls);
    expect(payload).not.toContain('must-never-log');
  });
});
