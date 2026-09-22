import type { UserDocument } from '../../users/schemas/user.schema';
import type { UsersService } from '../../users/users.service';
import type { IssuedAuthActionToken } from '../action-token/auth-action-token.service';
import type { AuthActionTokenService } from '../action-token/auth-action-token.service';
import type { AuthActionTokenRecord } from '../action-token/auth-action-token.types';
import type { AuthAuditService } from '../audit/auth-audit.service';
import type { AuthEmailDelivery } from '../delivery/auth-email-delivery.types';
import { PasswordService } from '../password.service';
import type { AuthSessionService } from '../session/auth-session.service';
import { AuthEmailDeliveryUnavailableError } from './auth-lifecycle.errors';
import { AuthLifecycleService } from './auth-lifecycle.service';

const NOW = new Date('2026-09-22T16:00:00.000Z');
const USER_ID = '507f1f77bcf86cd799439011';
const VERIFICATION_TOKEN = 'v'.repeat(43);
const RECOVERY_TOKEN = 'r'.repeat(43);
const SECOND_RECOVERY_TOKEN = 's'.repeat(43);

function userDocument(
  emailVerifiedAt: Date | null = null,
  version = 1,
): UserDocument {
  return {
    _id: {
      toString: () => USER_ID,
    },
    email: 'enzo@example.com',
    password_hash: 'legacy-hash',
    email_verified_at: emailVerifiedAt,
    credential_version: version,
  } as unknown as UserDocument;
}

function actionRecord(
  purpose: 'email_verification' | 'password_recovery',
  tokenHash = 'a'.repeat(64),
  credentialVersion?: number,
): AuthActionTokenRecord {
  return {
    id: '6c0c7aef-05f0-4a75-9eb9-60b8999d63f2',
    userId: USER_ID,
    purpose,
    tokenHash,
    credentialVersion,
    issueBucket: 1,
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
    consumedAt: NOW,
  };
}

function issued(token: string, ttlMs: number): IssuedAuthActionToken {
  return {
    token,
    expiresAt: new Date(NOW.getTime() + ttlMs),
  };
}

function createHarness() {
  const findByEmail = jest.fn<Promise<UserDocument | null>, [string]>();
  const findById = jest.fn<Promise<UserDocument | null>, [string]>();
  const markEmailVerifiedIfUnverified = jest.fn<
    Promise<boolean>,
    [string, Date]
  >();
  const replacePasswordIfCredentialVersion = jest.fn<
    Promise<boolean>,
    [string, number, string]
  >();

  const users = {
    findByEmail,
    findById,
    markEmailVerifiedIfUnverified,
    replacePasswordIfCredentialVersion,
  } as unknown as UsersService;

  const issueIfAllowed = jest.fn();
  const inspect = jest.fn();
  const claim = jest.fn();
  const invalidateToken = jest.fn();
  const invalidateAll = jest.fn();

  const actionTokens = {
    issueIfAllowed,
    inspect,
    claim,
    invalidateToken,
    invalidateAll,
  } as unknown as AuthActionTokenService;

  const revokeAll = jest.fn<Promise<void>, [string]>();
  const sessions = {
    revokeAll,
  } as unknown as AuthSessionService;

  const sendEmailVerification = jest.fn();
  const sendPasswordRecovery = jest.fn();
  const sendPasswordRecoveryCompleted = jest.fn();
  const sendPasswordChanged = jest.fn();
  const auditRecord = jest.fn();

  const delivery: AuthEmailDelivery = {
    sendEmailVerification,
    sendPasswordRecovery,
    sendPasswordRecoveryCompleted,
    sendPasswordChanged,
  };

  const passwords = new PasswordService();
  const audit = {
    record: auditRecord,
  } as unknown as AuthAuditService;

  const service = new AuthLifecycleService(
    users,
    actionTokens,
    sessions,
    passwords,
    audit,
    delivery,
  );

  return {
    service,
    mocks: {
      findByEmail,
      findById,
      markEmailVerifiedIfUnverified,
      replacePasswordIfCredentialVersion,
      issueIfAllowed,
      inspect,
      claim,
      invalidateToken,
      invalidateAll,
      revokeAll,
      sendEmailVerification,
      sendPasswordRecovery,
      sendPasswordRecoveryCompleted,
      sendPasswordChanged,
      auditRecord,
    },
  };
}

describe('AuthLifecycleService', () => {
  it('issues and delivers verification only for a pending account', async () => {
    const { service, mocks } = createHarness();
    const user = userDocument();
    const token = issued(VERIFICATION_TOKEN, 24 * 60 * 60 * 1000);

    mocks.findByEmail.mockResolvedValue(user);
    mocks.issueIfAllowed.mockResolvedValue(token);
    mocks.sendEmailVerification.mockResolvedValue(undefined);

    await service.requestEmailVerification(user.email, NOW);

    expect(mocks.issueIfAllowed).toHaveBeenCalledWith(
      USER_ID,
      'email_verification',
      undefined,
      NOW,
    );
    expect(mocks.sendEmailVerification).toHaveBeenCalledWith({
      to: user.email,
      token: VERIFICATION_TOKEN,
      expiresAt: token.expiresAt,
    });
  });

  it('invalidates a verification token when delivery fails', async () => {
    const { service, mocks } = createHarness();
    const user = userDocument();
    const token = issued(VERIFICATION_TOKEN, 24 * 60 * 60 * 1000);

    mocks.findByEmail.mockResolvedValue(user);
    mocks.issueIfAllowed.mockResolvedValue(token);
    mocks.sendEmailVerification.mockRejectedValue(new Error('smtp offline'));
    mocks.invalidateToken.mockResolvedValue(undefined);

    await expect(
      service.requestEmailVerification(user.email, NOW),
    ).rejects.toBeInstanceOf(AuthEmailDeliveryUnavailableError);

    expect(mocks.invalidateToken).toHaveBeenCalledWith(
      VERIFICATION_TOKEN,
      'email_verification',
      NOW,
    );
  });

  it('consumes verification before applying the monotonic verified transition', async () => {
    const { service, mocks } = createHarness();
    const action = actionRecord('email_verification');

    mocks.claim.mockResolvedValue(action);
    mocks.findById.mockResolvedValue(userDocument());
    mocks.markEmailVerifiedIfUnverified.mockResolvedValue(true);
    mocks.invalidateAll.mockResolvedValue(undefined);

    await expect(
      service.completeEmailVerification(VERIFICATION_TOKEN, NOW),
    ).resolves.toBe(true);

    expect(mocks.claim).toHaveBeenCalledWith(
      VERIFICATION_TOKEN,
      'email_verification',
      NOW,
    );
    expect(mocks.markEmailVerifiedIfUnverified).toHaveBeenCalledWith(
      USER_ID,
      NOW,
    );
    expect(mocks.invalidateAll).toHaveBeenCalledWith(
      USER_ID,
      'email_verification',
      NOW,
    );
  });

  it('allows only one verification winner when two claimed links race', async () => {
    const { service, mocks } = createHarness();
    const action = actionRecord('email_verification');

    mocks.claim.mockResolvedValue(action);
    mocks.findById.mockResolvedValue(userDocument());
    mocks.markEmailVerifiedIfUnverified
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mocks.invalidateAll.mockResolvedValue(undefined);

    const results = await Promise.all([
      service.completeEmailVerification(VERIFICATION_TOKEN, NOW),
      service.completeEmailVerification('w'.repeat(43), NOW),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(mocks.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('does nothing observable for recovery of an unknown account', async () => {
    const { service, mocks } = createHarness();
    mocks.findByEmail.mockResolvedValue(null);

    await expect(
      service.requestPasswordRecovery('missing@example.com', NOW),
    ).resolves.toBeUndefined();

    expect(mocks.issueIfAllowed).not.toHaveBeenCalled();
    expect(mocks.sendPasswordRecovery).not.toHaveBeenCalled();
  });

  it('invalidates a recovery token when delivery fails', async () => {
    const { service, mocks } = createHarness();
    const user = userDocument(new Date('2026-09-20T10:00:00.000Z'), 2);
    const token = issued(RECOVERY_TOKEN, 30 * 60 * 1000);

    mocks.findByEmail.mockResolvedValue(user);
    mocks.issueIfAllowed.mockResolvedValue(token);
    mocks.sendPasswordRecovery.mockRejectedValue(new Error('smtp offline'));
    mocks.invalidateToken.mockResolvedValue(undefined);

    await expect(
      service.requestPasswordRecovery(user.email, NOW),
    ).rejects.toBeInstanceOf(AuthEmailDeliveryUnavailableError);

    expect(mocks.issueIfAllowed).toHaveBeenCalledWith(
      USER_ID,
      'password_recovery',
      2,
      NOW,
    );
    expect(mocks.invalidateToken).toHaveBeenCalledWith(
      RECOVERY_TOKEN,
      'password_recovery',
      NOW,
    );
  });

  it('rejects recovery inspection when credential version already advanced', async () => {
    const { service, mocks } = createHarness();
    mocks.inspect.mockResolvedValue(
      actionRecord('password_recovery', 'b'.repeat(64), 1),
    );
    mocks.findById.mockResolvedValue(
      userDocument(new Date('2026-09-20T10:00:00.000Z'), 2),
    );

    await expect(
      service.inspectPasswordRecovery(RECOVERY_TOKEN, NOW),
    ).resolves.toBe(false);
  });

  it('changes password once, advances credential authority and revokes sessions', async () => {
    const { service, mocks } = createHarness();
    const user = userDocument(new Date('2026-09-20T10:00:00.000Z'), 3);

    mocks.claim.mockResolvedValue(
      actionRecord('password_recovery', 'c'.repeat(64), 3),
    );
    mocks.findById.mockResolvedValue(user);
    mocks.replacePasswordIfCredentialVersion.mockResolvedValue(true);
    mocks.invalidateAll.mockResolvedValue(undefined);
    mocks.revokeAll.mockResolvedValue(undefined);
    mocks.sendPasswordRecoveryCompleted.mockResolvedValue(undefined);

    const newPassword = 'new-correct-horse-battery';

    await expect(
      service.completePasswordRecovery(RECOVERY_TOKEN, newPassword, NOW),
    ).resolves.toBe(true);

    expect(mocks.replacePasswordIfCredentialVersion).toHaveBeenCalledTimes(1);
    const passwordUpdateCall =
      mocks.replacePasswordIfCredentialVersion.mock.calls[0];

    if (!passwordUpdateCall) {
      throw new Error('Expected password CAS update');
    }

    expect(passwordUpdateCall[0]).toBe(USER_ID);
    expect(passwordUpdateCall[1]).toBe(3);
    await expect(
      new PasswordService().verify(newPassword, passwordUpdateCall[2]),
    ).resolves.toBe(true);

    expect(mocks.invalidateAll).toHaveBeenCalledWith(
      USER_ID,
      'password_recovery',
      NOW,
    );
    expect(mocks.revokeAll).toHaveBeenCalledWith(USER_ID);
    expect(mocks.sendPasswordRecoveryCompleted).toHaveBeenCalledWith({
      to: user.email,
    });
  });

  it('allows only one password mutation when two valid recovery links race', async () => {
    const { service, mocks } = createHarness();
    const user = userDocument(new Date('2026-09-20T10:00:00.000Z'), 1);

    mocks.claim
      .mockResolvedValueOnce(
        actionRecord('password_recovery', 'd'.repeat(64), 1),
      )
      .mockResolvedValueOnce(
        actionRecord('password_recovery', 'e'.repeat(64), 1),
      );
    mocks.findById.mockResolvedValue(user);
    mocks.replacePasswordIfCredentialVersion
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mocks.invalidateAll.mockResolvedValue(undefined);
    mocks.revokeAll.mockResolvedValue(undefined);
    mocks.sendPasswordRecoveryCompleted.mockResolvedValue(undefined);

    const results = await Promise.all([
      service.completePasswordRecovery(
        RECOVERY_TOKEN,
        'first-new-password-2026',
        NOW,
      ),
      service.completePasswordRecovery(
        SECOND_RECOVERY_TOKEN,
        'second-new-password-2026',
        NOW,
      ),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(mocks.revokeAll).toHaveBeenCalledTimes(1);
    expect(mocks.sendPasswordRecoveryCompleted).toHaveBeenCalledTimes(1);
  });
});
