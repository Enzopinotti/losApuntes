import type { AuthActionTokenService } from '../../auth/action-token/auth-action-token.service';
import type { PasswordService } from '../../auth/password.service';
import type { AuthSessionService } from '../../auth/session/auth-session.service';
import type { UsersService } from '../../users/users.service';
import type { AccountLifecycleStore } from './account-lifecycle.store';
import { AccountLifecycleService } from './account-lifecycle.service';

const now = new Date('2026-10-01T23:00:00.000Z');

function deps() {
  const users = { findById: jest.fn() } as unknown as jest.Mocked<UsersService>;
  const passwords = {
    verify: jest.fn(),
  } as unknown as jest.Mocked<PasswordService>;
  const sessions = {
    revokeAll: jest.fn(),
  } as unknown as jest.Mocked<AuthSessionService>;
  const actionTokens = {
    invalidateAll: jest.fn(),
  } as unknown as jest.Mocked<AuthActionTokenService>;
  const store = {
    listManagementBlockers: jest.fn(),
    closeAccount: jest.fn(),
    claimNextCleanup: jest.fn(),
    completeCleanup: jest.fn(),
    rescheduleCleanup: jest.fn(),
    hasFailedCleanup: jest.fn().mockResolvedValue(false),
  } as unknown as jest.Mocked<AccountLifecycleStore>;

  return { users, passwords, sessions, actionTokens, store };
}

function service(d: ReturnType<typeof deps>) {
  return new AccountLifecycleService(
    d.users,
    d.passwords,
    d.sessions,
    d.actionTokens,
    d.store,
  );
}

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'user-1' },
    email: 'user@example.test',
    password_hash: 'hash',
    credential_version: 4,
    email_verified_at: now,
    account_status: 'active' as const,
    ...overrides,
  } as never;
}

describe('AccountLifecycleService', () => {
  it('returns bounded management blockers and reauthentication capability', async () => {
    const d = deps();
    d.users.findById.mockResolvedValue(activeUser());
    d.store.listManagementBlockers.mockResolvedValue({
      items: [{ organizationId: 'org-1', role: 'owner' }],
      truncated: true,
    });

    await expect(service(d).preflight('user-1')).resolves.toEqual({
      reauthentication: 'password',
      managementBlockers: [{ organizationId: 'org-1', role: 'owner' }],
      managementBlockersTruncated: true,
      managementBlockerLimit: 20,
    });
  });

  it('fails closed when destructive reauthentication is unsupported', async () => {
    const d = deps();
    d.users.findById.mockResolvedValue(
      activeUser({ password_hash: undefined }),
    );

    await expect(service(d).close('user-1', 4, 'secret', now)).resolves.toEqual(
      {
        kind: 'reauthentication_unavailable',
      },
    );
    expect(d.store.closeAccount.mock.calls).toHaveLength(0);
  });

  it('requires the current password before committing closure', async () => {
    const d = deps();
    d.users.findById.mockResolvedValue(activeUser());
    d.passwords.verify.mockResolvedValue(false);

    await expect(service(d).close('user-1', 4, 'wrong', now)).resolves.toEqual({
      kind: 'invalid_current_password',
    });
    expect(d.store.closeAccount.mock.calls).toHaveLength(0);
  });

  it('maps management blockers without partially closing authority', async () => {
    const d = deps();
    d.users.findById.mockResolvedValue(activeUser());
    d.passwords.verify.mockResolvedValue(true);
    d.store.closeAccount.mockResolvedValue({ status: 'manager_blocked' });

    await expect(service(d).close('user-1', 4, 'secret', now)).resolves.toEqual(
      {
        kind: 'management_blocked',
      },
    );
  });

  it('accepts transactional closure and returns its durable cleanup job id', async () => {
    const d = deps();
    d.users.findById.mockResolvedValue(activeUser());
    d.passwords.verify.mockResolvedValue(true);
    d.store.closeAccount.mockImplementation((input) =>
      Promise.resolve({
        status: 'closed',
        cleanupJobId: input.cleanupJobId,
      }),
    );

    const result = await service(d).close('user-1', 4, 'secret', now);
    expect(result.kind).toBe('accepted');
    if (result.kind !== 'accepted')
      throw new Error('Expected closure to succeed');
    expect(typeof result.cleanupJobId).toBe('string');
    const closeCall = d.store.closeAccount.mock.calls[0]?.[0];
    expect(closeCall).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        expectedCredentialVersion: 4,
        now,
      }),
    );
    expect(typeof closeCall?.auditId).toBe('string');
    expect(typeof closeCall?.cleanupJobId).toBe('string');
  });

  it('retries cleanup idempotently without reopening account authority', async () => {
    const d = deps();
    d.store.claimNextCleanup
      .mockResolvedValueOnce({
        id: 'job-1',
        userId: 'user-1',
        state: 'processing',
        attempts: 1,
        nextAttemptAt: now,
        claimId: 'claim',
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        failureCode: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .mockResolvedValueOnce(null);
    d.sessions.revokeAll.mockRejectedValueOnce(new Error('store unavailable'));
    d.store.rescheduleCleanup.mockResolvedValue(true);

    await expect(service(d).processPendingCleanup(5, now)).resolves.toEqual({
      examined: 1,
      completed: 0,
      retryScheduled: 1,
      failed: 0,
      terminalFailuresPresent: false,
    });
  });

  it('keeps terminal cleanup failures visible to worker health', async () => {
    const d = deps();
    d.store.claimNextCleanup.mockResolvedValue(null);
    d.store.hasFailedCleanup.mockResolvedValue(true);

    await expect(service(d).processPendingCleanup(5, now)).resolves.toEqual({
      examined: 0,
      completed: 0,
      retryScheduled: 0,
      failed: 0,
      terminalFailuresPresent: true,
    });
  });

  it('completes cleanup after revoking sessions and both token purposes', async () => {
    const d = deps();
    d.store.claimNextCleanup
      .mockResolvedValueOnce({
        id: 'job-1',
        userId: 'user-1',
        state: 'processing',
        attempts: 1,
        nextAttemptAt: now,
        claimId: 'claim',
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        failureCode: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .mockResolvedValueOnce(null);
    d.sessions.revokeAll.mockResolvedValue(undefined);
    d.actionTokens.invalidateAll.mockResolvedValue(undefined);
    d.store.completeCleanup.mockResolvedValue(true);

    await expect(service(d).processPendingCleanup(5, now)).resolves.toEqual({
      examined: 1,
      completed: 1,
      retryScheduled: 0,
      failed: 0,
      terminalFailuresPresent: false,
    });
    expect(d.actionTokens.invalidateAll.mock.calls).toEqual([
      ['user-1', 'email_verification', now],
      ['user-1', 'password_recovery', now],
    ]);
  });
});
