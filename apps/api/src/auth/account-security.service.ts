import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  credentialVersion,
  isAccountActive,
} from '../users/user-security-state';
import { UsersService } from '../users/users.service';
import { AuthActionTokenService } from './action-token/auth-action-token.service';
import { AuthAuditService } from './audit/auth-audit.service';
import {
  AUTH_EMAIL_DELIVERY,
  type AuthEmailDelivery,
} from './delivery/auth-email-delivery.types';
import { PasswordService } from './password.service';
import { AuthSessionService } from './session/auth-session.service';

export type PasswordChangeOutcome =
  | { kind: 'changed' }
  | { kind: 'invalid_current_password' }
  | { kind: 'conflict' }
  | { kind: 'account_restricted' };

@Injectable()
export class AccountSecurityService {
  private readonly logger = new Logger(AccountSecurityService.name);

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly sessions: AuthSessionService,
    private readonly actionTokens: AuthActionTokenService,
    private readonly audit: AuthAuditService,
    @Inject(AUTH_EMAIL_DELIVERY)
    private readonly delivery: AuthEmailDelivery,
  ) {}

  async changePassword(
    userId: string,
    expectedCredentialVersion: number,
    currentPassword: string,
    newPassword: string,
    now = new Date(),
  ): Promise<PasswordChangeOutcome> {
    const user = await this.users.findById(userId);

    if (!user) {
      return { kind: 'conflict' };
    }

    if (!isAccountActive(user)) {
      return { kind: 'account_restricted' };
    }

    if (credentialVersion(user) !== expectedCredentialVersion) {
      return { kind: 'conflict' };
    }

    if (!user.password_hash) {
      return { kind: 'invalid_current_password' };
    }

    const currentMatches = await this.passwords.verify(
      currentPassword,
      user.password_hash,
    );

    if (!currentMatches) {
      return { kind: 'invalid_current_password' };
    }

    const passwordHash = await this.passwords.hash(newPassword);
    const changed = await this.users.replacePasswordIfCredentialVersion(
      userId,
      expectedCredentialVersion,
      passwordHash,
    );

    if (!changed) {
      return { kind: 'conflict' };
    }

    await this.bestEffortCleanup(userId, now);

    await this.audit.record({
      event: 'auth.password.changed',
      userId,
      occurredAt: now,
    });

    try {
      await this.delivery.sendPasswordChanged({
        to: user.email,
      });
    } catch {
      this.logger.warn('auth.password.change.confirmation_delivery_failed');
    }

    return { kind: 'changed' };
  }

  private async bestEffortCleanup(userId: string, now: Date): Promise<void> {
    try {
      await this.actionTokens.invalidateAll(userId, 'password_recovery', now);
    } catch {
      this.logger.warn('auth.password.change.recovery_cleanup_failed');
    }

    try {
      await this.sessions.revokeAll(userId);
    } catch {
      this.logger.warn('auth.password.change.session_cleanup_failed');
    }
  }
}
