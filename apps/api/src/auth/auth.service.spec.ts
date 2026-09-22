import * as bcrypt from 'bcrypt';

import type { UserDocument } from '../users/schemas/user.schema';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { AuthLifecycleService } from './lifecycle/auth-lifecycle.service';
import { PasswordService } from './password.service';
import type { AuthSessionService } from './session/auth-session.service';

const SESSION = {
  id: '93b0d36e-a992-487f-b9ba-1173c47800f7',
  clientType: 'web' as const,
  createdAt: '2026-09-22T12:00:00.000Z',
  lastSeenAt: '2026-09-22T12:00:00.000Z',
  expiresAt: '2026-10-22T12:00:00.000Z',
  current: true,
};

function userDocument(
  passwordHash: string,
  emailVerifiedAt: Date | null | undefined = new Date(
    '2026-09-22T10:00:00.000Z',
  ),
  accountStatus: 'active' | 'restricted' | undefined = undefined,
): UserDocument {
  return {
    _id: {
      toString: () => 'user-1',
    },
    email: 'enzo@example.com',
    password_hash: passwordHash,
    email_verified_at: emailVerifiedAt,
    credential_version: 1,
    account_status: accountStatus,
  } as unknown as UserDocument;
}

describe('AuthService', () => {
  const createPasswordAccountIfAbsent = jest.fn<
    Promise<void>,
    [string, string]
  >();
  const findByEmail = jest.fn<Promise<UserDocument | null>, [string]>();
  const issueSession = jest.fn();
  const requestEmailVerification = jest.fn();

  const usersService = {
    createPasswordAccountIfAbsent,
    findByEmail,
  } as unknown as UsersService;

  const sessions = {
    issue: issueSession,
  } as unknown as AuthSessionService;

  const lifecycle = {
    requestEmailVerification,
  } as unknown as AuthLifecycleService;

  const passwords = new PasswordService();

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(usersService, sessions, lifecycle, passwords);
  });

  it('hashes registration password, requests verification and never creates a session', async () => {
    createPasswordAccountIfAbsent.mockResolvedValue();
    requestEmailVerification.mockResolvedValue(undefined);

    await service.register({
      email: 'enzo@example.com',
      password: 'correct-horse-battery',
    });

    expect(createPasswordAccountIfAbsent).toHaveBeenCalledTimes(1);
    const [email, passwordHash] =
      createPasswordAccountIfAbsent.mock.calls[0] ?? [];

    expect(email).toBe('enzo@example.com');
    expect(passwordHash).toBeDefined();
    expect(passwordHash).not.toBe('correct-horse-battery');

    if (!passwordHash) {
      throw new Error('Expected registration to derive a password hash');
    }

    await expect(
      bcrypt.compare('correct-horse-battery', passwordHash),
    ).resolves.toBe(true);
    expect(requestEmailVerification).toHaveBeenCalledWith('enzo@example.com');
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('does not reveal whether an unknown account is unverified', async () => {
    findByEmail.mockResolvedValue(null);

    await expect(
      service.login(
        {
          email: 'missing@example.com',
          password: 'not-a-real-password',
        },
        'web',
      ),
    ).resolves.toEqual({ kind: 'invalid_credentials' });

    expect(issueSession).not.toHaveBeenCalled();
  });

  it('does not reveal verification state when the password is wrong', async () => {
    const hash = await bcrypt.hash('real-password', 4);
    findByEmail.mockResolvedValue(userDocument(hash, null));

    await expect(
      service.login(
        {
          email: 'enzo@example.com',
          password: 'wrong-password',
        },
        'web',
      ),
    ).resolves.toEqual({ kind: 'invalid_credentials' });

    expect(issueSession).not.toHaveBeenCalled();
  });

  it('does not reveal restriction state when the password is wrong', async () => {
    const hash = await bcrypt.hash('real-password', 4);
    findByEmail.mockResolvedValue(userDocument(hash, undefined, 'restricted'));

    await expect(
      service.login(
        {
          email: 'enzo@example.com',
          password: 'wrong-password',
        },
        'web',
      ),
    ).resolves.toEqual({ kind: 'invalid_credentials' });

    expect(issueSession).not.toHaveBeenCalled();
  });

  it('blocks a restricted account only after correct credential proof', async () => {
    const hash = await bcrypt.hash('real-password', 4);
    findByEmail.mockResolvedValue(userDocument(hash, undefined, 'restricted'));

    await expect(
      service.login(
        {
          email: 'enzo@example.com',
          password: 'real-password',
        },
        'web',
      ),
    ).resolves.toEqual({ kind: 'account_restricted' });

    expect(issueSession).not.toHaveBeenCalled();
  });

  it('requires email verification only after the password is proven', async () => {
    const hash = await bcrypt.hash('real-password', 4);
    findByEmail.mockResolvedValue(userDocument(hash, null));

    await expect(
      service.login(
        {
          email: 'enzo@example.com',
          password: 'real-password',
        },
        'web',
      ),
    ).resolves.toEqual({ kind: 'email_verification_required' });

    expect(issueSession).not.toHaveBeenCalled();
  });

  it('issues an opaque session after verified credential proof', async () => {
    const hash = await bcrypt.hash('real-password', 4);
    findByEmail.mockResolvedValue(userDocument(hash));
    issueSession.mockResolvedValue({
      sessionToken: 's'.repeat(43),
      session: SESSION,
    });

    await expect(
      service.login(
        {
          email: 'enzo@example.com',
          password: 'real-password',
        },
        'web',
      ),
    ).resolves.toEqual({
      kind: 'authenticated',
      user: {
        id: 'user-1',
        email: 'enzo@example.com',
      },
      sessionToken: 's'.repeat(43),
      session: SESSION,
    });

    expect(issueSession).toHaveBeenCalledWith('user-1', 'web', 1);
  });
});
