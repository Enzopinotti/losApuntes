import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  credentialVersion,
  isEmailVerified,
} from '../../users/user-security-state';
import { UsersService } from '../../users/users.service';
import { AuthActionTokenService } from '../action-token/auth-action-token.service';
import { AuthAuditService } from '../audit/auth-audit.service';
import {
  AUTH_EMAIL_DELIVERY,
  type AuthEmailDelivery,
} from '../delivery/auth-email-delivery.types';
import { PasswordService } from '../password.service';
import { AuthSessionService } from '../session/auth-session.service';
import { AuthEmailDeliveryUnavailableError } from './auth-lifecycle.errors';

@Injectable()
export class AuthLifecycleService {
  private readonly logger = new Logger(AuthLifecycleService.name);

  constructor(
    private readonly users: UsersService,
    private readonly actionTokens: AuthActionTokenService,
    private readonly sessions: AuthSessionService,
    private readonly passwords: PasswordService,
    private readonly audit: AuthAuditService,
    @Inject(AUTH_EMAIL_DELIVERY)
    private readonly delivery: AuthEmailDelivery,
  ) {}

  async requestEmailVerification(
    email: string,
    now = new Date(),
  ): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || isEmailVerified(user)) return;

    const issued = await this.actionTokens.issueIfAllowed(
      user._id.toString(),
      'email_verification',
      undefined,
      now,
    );

    if (!issued) return;

    try {
      await this.delivery.sendEmailVerification({
        to: user.email,
        token: issued.token,
        expiresAt: issued.expiresAt,
      });
    } catch {
      await this.actionTokens.invalidateToken(
        issued.token,
        'email_verification',
        now,
      );
      this.logger.warn('auth.email.verification.delivery_failed');
      throw new AuthEmailDeliveryUnavailableError();
    }
  }

  async inspectEmailVerification(
    token: string,
    now = new Date(),
  ): Promise<boolean> {
    const availableAction = await this.actionTokens.inspect(
      token,
      'email_verification',
      now,
    );

    if (availableAction) {
      const user = await this.users.findById(availableAction.userId);
      return Boolean(user && !isEmailVerified(user));
    }

    const claimedAction = await this.actionTokens.findClaimed(
      token,
      'email_verification',
      now,
    );
    if (!claimedAction) return false;

    const user = await this.users.findById(claimedAction.userId);
    return Boolean(user);
  }

  async completeEmailVerification(
    token: string,
    now = new Date(),
  ): Promise<boolean> {
    let action = await this.actionTokens.claim(
      token,
      'email_verification',
      now,
    );
    if (!action) {
      action = await this.actionTokens.findClaimed(
        token,
        'email_verification',
        now,
      );
    }
    if (!action) return false;

    const user = await this.users.findById(action.userId);
    if (!user) return false;

    if (isEmailVerified(user)) {
      await this.actionTokens.invalidateAll(
        action.userId,
        'email_verification',
        now,
      );
      return true;
    }

    const changed = await this.users.markEmailVerifiedIfUnverified(
      action.userId,
      now,
    );
    if (!changed) {
      const reconciledUser = await this.users.findById(action.userId);
      if (!reconciledUser || !isEmailVerified(reconciledUser)) return false;

      await this.actionTokens.invalidateAll(
        action.userId,
        'email_verification',
        now,
      );
      return true;
    }

    await this.actionTokens.invalidateAll(
      action.userId,
      'email_verification',
      now,
    );

    await this.audit.record({
      event: 'auth.email.verified',
      userId: action.userId,
      occurredAt: now,
    });

    return true;
  }

  async requestPasswordRecovery(
    email: string,
    now = new Date(),
  ): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;

    const version = credentialVersion(user);
    const issued = await this.actionTokens.issueIfAllowed(
      user._id.toString(),
      'password_recovery',
      version,
      now,
    );

    if (!issued) return;

    try {
      await this.delivery.sendPasswordRecovery({
        to: user.email,
        token: issued.token,
        expiresAt: issued.expiresAt,
      });
    } catch {
      await this.actionTokens.invalidateToken(
        issued.token,
        'password_recovery',
        now,
      );
      this.logger.warn('auth.password.recovery.delivery_failed');
      throw new AuthEmailDeliveryUnavailableError();
    }
  }

  async inspectPasswordRecovery(
    token: string,
    now = new Date(),
  ): Promise<boolean> {
    const action = await this.actionTokens.inspect(
      token,
      'password_recovery',
      now,
    );
    if (!action || action.credentialVersion === undefined) return false;

    const user = await this.users.findById(action.userId);
    return Boolean(
      user && credentialVersion(user) === action.credentialVersion,
    );
  }

  async completePasswordRecovery(
    token: string,
    newPassword: string,
    now = new Date(),
  ): Promise<boolean> {
    const action = await this.actionTokens.claim(
      token,
      'password_recovery',
      now,
    );
    if (!action || action.credentialVersion === undefined) return false;

    const user = await this.users.findById(action.userId);
    if (!user || credentialVersion(user) !== action.credentialVersion) {
      return false;
    }

    const passwordHash = await this.passwords.hash(newPassword);
    const changed = await this.users.replacePasswordIfCredentialVersion(
      action.userId,
      action.credentialVersion,
      passwordHash,
    );
    if (!changed) return false;

    await this.actionTokens.invalidateAll(
      action.userId,
      'password_recovery',
      now,
    );

    try {
      await this.sessions.revokeAll(action.userId);
    } catch {
      // credentialVersion is the security boundary; deletion is cleanup.
    }

    await this.audit.record({
      event: 'auth.password.recovery.completed',
      userId: action.userId,
      occurredAt: now,
    });

    try {
      await this.delivery.sendPasswordRecoveryCompleted({
        to: user.email,
      });
    } catch {
      this.logger.warn('auth.password.recovery.confirmation_delivery_failed');
      // The credential change already succeeded; notification failure cannot undo it.
    }

    return true;
  }
}
