import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  credentialVersion,
  isEmailVerified,
} from '../../users/user-security-state';
import { UsersService } from '../../users/users.service';
import { AuthActionTokenService } from '../action-token/auth-action-token.service';
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
    const action = await this.actionTokens.inspect(
      token,
      'email_verification',
      now,
    );
    if (!action) return false;

    const user = await this.users.findById(action.userId);
    return Boolean(user && !isEmailVerified(user));
  }

  async completeEmailVerification(
    token: string,
    now = new Date(),
  ): Promise<boolean> {
    const action = await this.actionTokens.claim(
      token,
      'email_verification',
      now,
    );
    if (!action) return false;

    const user = await this.users.findById(action.userId);
    if (!user || isEmailVerified(user)) return false;

    const changed = await this.users.markEmailVerifiedIfUnverified(
      action.userId,
      now,
    );
    if (!changed) return false;

    await this.actionTokens.invalidateAll(
      action.userId,
      'email_verification',
      now,
    );

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
