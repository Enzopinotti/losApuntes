export const AUTH_AUDIT_SINK = Symbol('AUTH_AUDIT_SINK');

export type AuthAuditEventName =
  | 'auth.email.verified'
  | 'auth.password.recovery.completed'
  | 'auth.password.changed'
  | 'auth.session.revoked'
  | 'auth.session.revoked_all'
  | 'auth.account.restricted'
  | 'auth.account.restored';

export type AuthAuditEvent = {
  event: AuthAuditEventName;
  userId: string;
  sessionId?: string;
  clientType?: 'web' | 'mobile';
  occurredAt: Date;
};

export interface AuthAuditSink {
  record(event: AuthAuditEvent): Promise<void> | void;
}
