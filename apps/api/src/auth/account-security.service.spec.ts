import type { UserDocument } from '../users/schemas/user.schema';
import type { UsersService } from '../users/users.service';
import type { AuthActionTokenService } from './action-token/auth-action-token.service';
import { AccountSecurityService } from './account-security.service';
import type { AuthAuditService } from './audit/auth-audit.service';
import type { AuthEmailDelivery } from './delivery/auth-email-delivery.types';
import type { PasswordService } from './password.service';
import type { AuthSessionService } from './session/auth-session.service';

const NOW = new Date('2026-09-22T16:30:00.000Z');
const USER_ID = '507f1f77bcf86cd799439011';

function userDocument(
  version = 3,
  accountStatus: 'active' | 'restricted' | undefined = 'active',
): UserDocument {
  return {
    _id: {
      toString: () => USER_ID,
    },
    email: 'enzo@example.com',
    password_hash: 'stored-password-hash',
    email_verified_at: new Date('2026-09-20T10:00:00.000Z'),
    credential_version: version,
    account_status: accountStatus,
  } as unknown as UserDocument;
}

function createHarness() {
  const findById = jest.fn<Promise<UserDocument | null>, [string]>();
  const replacePasswordIfCredentialVersion = jest.fn<
    Promise<boolean>,
    [string, number, string]
  >();

  const users = {
    findById,
    replacePasswordIfCredentialVersion,
  } as unknown as UsersService;

  const verify = jest.fn<Promise<boolean>, [string, string]>();
  const hash = jest.fn<Promise<string>, [string]>();
  const passwords = {
    verify,
    hash,
  } as unknown as PasswordService;

  const revokeAll = jest.fn<Promise<void>, [string]>();
  const sessions = {
    revokeAll,
  } as unknown as AuthSessionService;

  const invalidateAll = jest.fn<
    Promise<void>,
    [string, 'password_recovery', Date]
  >();
  const actionTokens = {
    invalidateAll,
  } as unknown as AuthActionTokenService;

  const auditRecord = jest.fn<Promise<void>, [Record<string, unknown>]>();
  const audit = {
    record: auditRecord,
  } as unknown as AuthAuditService;

  const sendPasswordChanged = jest.fn<
    Promise<void>,
    [{ to: string }]
  >();
  const delivery = {
    sendPasswordChanged,
  } as unknown as AuthEmailDelivery;

  const service = new AccountSecurityService(
    users,
    passwords,
    sessions,
    actionTokens,
    audit,
    delivery,
  );

  return {
    service,
    mocks: {
      findById,
      replacePasswordIfCredentialVersion,
      verify,
      hash,
      revokeAll,
      invalidateAll,
      auditRecord,
      sendPasswordChanged,
    },
  };
}

describe('AccountSecurityService', () => {
  it('fails closed when the account no longer exists', async () => {
    const { service, mocks } = createHarness();
    mocks.findById.mockResolvedValue(null);

    await expect(
      service.changePassword(
        USER_ID,
        3,
        'current-password',
        'new-password-2026',
        NOW,
      ),
    ).resolves.toEqual({ kind: 'conflict' });

    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.replacePasswordIfCredentialVersion).not.toHaveBeenCalled();
  });

  it('blocks a restricted account before password verification', async () => {
    const { service, mocks } = createHarness();
    mocks.findById.mockResolvedValue(userDocument(3, 'restricted'));

    await expect(
      service.changePassword(
        USER_ID,
        3,
        'current-password',
        'new-password-2026',
        NOW,
      ),
    ).resolves.toEqual({ kind: 'account_restricted' });

    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it('rejects a stale credential version before checking the password', async () => {
    const { service, mocks } = createHarness();
    mocks.findById.mockResolvedValue(userDocument(4));

    await expect(
      service.changePassword(
        USER_ID,
        3,
        'current-password',
        'new-password-2026',
        NOW,
      ),
    ).resolves.toEqual({ kind: 'conflict' });

    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it('does not mutate security state when the current password is wrong', async () => {
    const { service, mocks } = createHarness();
    mocks.findById.mockResolvedValue(userDocument());
    mocks.verify.mockResolvedValue(false);

    await expect(
      service.changePassword(
        USER_ID,
        3,
        'wrong-current-password',
        'new-password-2026',
        NOW,
      ),
    ).resolves.toEqual({ kind: 'invalid_current_password' });

    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.replacePasswordIfCredentialVersion).not.toHaveBeenCalled();
    expect(mocks.invalidateAll).not.toHaveBeenCalled();
    expect(mocks.revokeAll).not.toHaveBeenCalled();
    expect(mocks.auditRecord).not.toHaveBeenCalled();
    expect(mocks.sendPasswordChanged).not.toHaveBeenCalled();
  });

  it('does not revoke sessions when the credential CAS loses', async () => {
    const { service, mocks } = createHarness();
    mocks.findById.mockResolvedValue(userDocument());
    mocks.verify.mockResolvedValue(true);
    mocks.hash.mockResolvedValue('new-password-hash');
    mocks.replacePasswordIfCredentialVersion.mockResolvedValue(false);

    await expect(
      service.changePassword(
        USER_ID,
        3,
        'current-password',
        'new-password-2026',
        NOW,
      ),
    ).resolves.toEqual({ kind: 'conflict' });

    expect(mocks.replacePasswordIfCredentialVersion).toHaveBeenCalledWith(
      USER_ID,
      3,
      'new-password-hash',
    );
    expect(mocks.invalidateAll).not.toHaveBeenCalled();
    expect(mocks.revokeAll).not.toHaveBeenCalled();
    expect(mocks.auditRecord).not.toHaveBeenCalled();
  });

  it('changes credentials, cleans stale authority, audits and notifies', async () => {
    const { service, mocks } = createHarness();
    mocks.findById.mockResolvedValue(userDocument());
    mocks.verify.mockResolvedValue(true);
    mocks.hash.mockResolvedValue('new-password-hash');
    mocks.replacePasswordIfCredentialVersion.mockResolvedValue(true);
    mocks.invalidateAll.mockResolvedValue(undefined);
    mocks.revokeAll.mockResolvedValue(undefined);
    mocks.auditRecord.mockResolvedValue(undefined);
    mocks.sendPasswordChanged.mockResolvedValue(undefined);

    await expect(
      service.changePassword(
        USER_ID,
        3,
        'current-password',
        'new-password-2026',
        NOW,
      ),
    ).resolves.toEqual({ kind: 'changed' });

    expect(mocks.invalidateAll).toHaveBeenCalledWith(
      USER_ID,
      'password_recovery',
      NOW,
    );
    expect(mocks.revokeAll).toHaveBeenCalledWith(USER_ID);
    expect(mocks.auditRecord).toHaveBeenCalledWith({
      event: 'auth.password.changed',
      userId: USER_ID,
      occurredAt: NOW,
    });
    expect(mocks.sendPasswordChanged).toHaveBeenCalledWith({
      to: 'enzo@example.com',
    });
  });

  it('keeps the password change authoritative when cleanup and notification fail', async () => {
    const { service, mocks } = createHarness();
    mocks.findById.mockResolvedValue(userDocument());
    mocks.verify.mockResolvedValue(true);
    mocks.hash.mockResolvedValue('new-password-hash');
    mocks.replacePasswordIfCredentialVersion.mockResolvedValue(true);
    mocks.invalidateAll.mockRejectedValue(new Error('token cleanup failed'));
    mocks.revokeAll.mockRejectedValue(new Error('session cleanup failed'));
    mocks.auditRecord.mockResolvedValue(undefined);
    mocks.sendPasswordChanged.mockRejectedValue(new Error('smtp failed'));

    await expect(
      service.changePassword(
        USER_ID,
        3,
        'current-password',
        'new-password-2026',
        NOW,
      ),
    ).resolves.toEqual({ kind: 'changed' });

    expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
  });

  it('allows only one credential mutation when two changes race', async () => {
    const { service, mocks } = createHarness();
    mocks.findById.mockResolvedValue(userDocument());
    mocks.verify.mockResolvedValue(true);
    mocks.hash
      .mockResolvedValueOnce('first-password-hash')
      .mockResolvedValueOnce('second-password-hash');
    mocks.replacePasswordIfCredentialVersion
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mocks.invalidateAll.mockResolvedValue(undefined);
    mocks.revokeAll.mockResolvedValue(undefined);
    mocks.auditRecord.mockResolvedValue(undefined);
    mocks.sendPasswordChanged.mockResolvedValue(undefined);

    const results = await Promise.all([
      service.changePassword(
        USER_ID,
        3,
        'current-password',
        'first-new-password-2026',
        NOW,
      ),
      service.changePassword(
        USER_ID,
        3,
        'current-password',
        'second-new-password-2026',
        NOW,
      ),
    ]);

    expect(results.filter((result) => result.kind === 'changed')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'conflict')).toHaveLength(1);
    expect(mocks.revokeAll).toHaveBeenCalledTimes(1);
    expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
    expect(mocks.sendPasswordChanged).toHaveBeenCalledTimes(1);
  });
});
