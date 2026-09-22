import * as bcrypt from 'bcrypt';

import type { UserDocument } from '../users/schemas/user.schema';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { AuthSessionService } from './session/auth-session.service';

const SESSION = {
  id: '93b0d36e-a992-487f-b9ba-1173c47800f7',
  clientType: 'web' as const,
  createdAt: '2026-09-22T12:00:00.000Z',
  lastSeenAt: '2026-09-22T12:00:00.000Z',
  expiresAt: '2026-10-22T12:00:00.000Z',
  current: true,
};

function userDocument(passwordHash: string): UserDocument {
  return {
    _id: {
      toString: () => 'user-1',
    },
    email: 'enzo@example.com',
    password_hash: passwordHash,
  } as unknown as UserDocument;
}

describe('AuthService', () => {
  const createPasswordAccountIfAbsent = jest.fn<
    Promise<void>,
    [string, string]
  >();
  const findByEmail = jest.fn<Promise<UserDocument | null>, [string]>();
  const issueSession = jest.fn();

  const usersService = {
    createPasswordAccountIfAbsent,
    findByEmail,
  } as unknown as UsersService;

  const sessions = {
    issue: issueSession,
  } as unknown as AuthSessionService;

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(usersService, sessions);
  });

  it('hashes a new password and never creates a session during registration', async () => {
    createPasswordAccountIfAbsent.mockResolvedValue();

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
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('returns null and does not issue a session for an unknown account', async () => {
    findByEmail.mockResolvedValue(null);

    await expect(
      service.login(
        {
          email: 'missing@example.com',
          password: 'not-a-real-password',
        },
        'web',
      ),
    ).resolves.toBeNull();

    expect(issueSession).not.toHaveBeenCalled();
  });

  it('returns null and does not issue a session for a wrong password', async () => {
    const hash = await bcrypt.hash('real-password', 4);
    findByEmail.mockResolvedValue(userDocument(hash));

    await expect(
      service.login(
        {
          email: 'enzo@example.com',
          password: 'wrong-password',
        },
        'web',
      ),
    ).resolves.toBeNull();

    expect(issueSession).not.toHaveBeenCalled();
  });

  it('issues an opaque session after successful credential verification', async () => {
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
      user: {
        id: 'user-1',
        email: 'enzo@example.com',
      },
      sessionToken: 's'.repeat(43),
      session: SESSION,
    });

    expect(issueSession).toHaveBeenCalledWith('user-1', 'web');
  });
});
