import type { UserDocument } from '../../users/schemas/user.schema';
import type { UsersService } from '../../users/users.service';
import type { AuthAuditService } from '../audit/auth-audit.service';
import type { PasswordService } from '../password.service';
import type { AuthSessionService } from '../session/auth-session.service';
import { GoogleAuthService } from './google-auth.service';
import type { GoogleIdentityService } from './google-identity.service';
import type { GoogleOAuthAttemptService } from './google-oauth-attempt.service';
import type {
  GoogleIdentityProof,
  GoogleIdentityProvider,
} from './google.types';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';
const SESSION_TOKEN = 's'.repeat(43);

function user(overrides: Partial<UserDocument> = {}): UserDocument {
  return {
    _id: {
      toString: () => USER_ID,
    },
    email: 'student@gmail.com',
    password_hash: 'hash',
    email_verified_at: new Date('2026-09-20T10:00:00.000Z'),
    credential_version: 1,
    account_status: 'active',
    ...overrides,
  } as unknown as UserDocument;
}

function proof(
  overrides: Partial<GoogleIdentityProof> = {},
): GoogleIdentityProof {
  return {
    subject: 'google-subject-1',
    email: 'student@gmail.com',
    emailVerified: true,
    nonce: 'n'.repeat(43),
    ...overrides,
  };
}

function harness() {
  const findByEmail = jest.fn();
  const findById = jest.fn();
  const createGoogleAccountIfEmailFree = jest.fn();
  const deleteGoogleOnlyAccountIfUnclaimed = jest.fn();

  const users = {
    findByEmail,
    findById,
    createGoogleAccountIfEmailFree,
    deleteGoogleOnlyAccountIfUnclaimed,
  } as unknown as UsersService;

  const findBySubject = jest.fn();
  const findForUser = jest.fn();
  const link = jest.fn();
  const unlinkForUser = jest.fn();

  const identities = {
    findBySubject,
    findForUser,
    link,
    unlinkForUser,
  } as unknown as GoogleIdentityService;

  const issueAttempt = jest.fn();
  const consume = jest.fn();
  const nonceMatches = jest.fn();

  const attempts = {
    issue: issueAttempt,
    consume,
    nonceMatches,
  } as unknown as GoogleOAuthAttemptService;

  const issueSession = jest.fn();
  const sessions = {
    issue: issueSession,
  } as unknown as AuthSessionService;

  const verifyPassword = jest.fn();
  const passwords = {
    verify: verifyPassword,
  } as unknown as PasswordService;

  const auditRecord = jest.fn();
  const audit = {
    record: auditRecord,
  } as unknown as AuthAuditService;

  const createWebAuthorizationUrl = jest.fn();
  const exchangeWebAuthorizationCode = jest.fn();
  const verifyMobileIdToken = jest.fn();
  const provider: GoogleIdentityProvider = {
    isWebEnabled: jest.fn(() => true),
    isMobileEnabled: jest.fn(() => true),
    createWebAuthorizationUrl,
    exchangeWebAuthorizationCode,
    verifyMobileIdToken,
  };

  const service = new GoogleAuthService(
    users,
    identities,
    attempts,
    sessions,
    passwords,
    audit,
    provider,
  );

  return {
    service,
    provider,
    mocks: {
      findByEmail,
      findById,
      createGoogleAccountIfEmailFree,
      deleteGoogleOnlyAccountIfUnclaimed,
      findBySubject,
      findForUser,
      link,
      unlinkForUser,
      issueAttempt,
      consume,
      nonceMatches,
      issueSession,
      verifyPassword,
      auditRecord,
      createWebAuthorizationUrl,
      exchangeWebAuthorizationCode,
      verifyMobileIdToken,
    },
  };
}

describe('GoogleAuthService', () => {
  it('logs in an already-linked provider subject without trusting email identity', async () => {
    const { service, mocks } = harness();
    mocks.verifyMobileIdToken.mockResolvedValue(
      proof({ email: 'new-address@gmail.com' }),
    );
    mocks.findBySubject.mockResolvedValue({
      id: 'identity-1',
      provider: 'google',
      providerSubject: 'google-subject-1',
      userId: USER_ID,
      emailAtLink: 'old-address@gmail.com',
      linkedAt: new Date(),
    });
    mocks.findById.mockResolvedValue(user());
    mocks.issueSession.mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      session: {
        id: 'session-1',
        clientType: 'mobile',
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        current: true,
      },
    });

    const result = await service.loginMobile('google-id-token');

    expect(result.kind).toBe('authenticated');
    expect(mocks.findByEmail).not.toHaveBeenCalled();
    expect(mocks.issueSession).toHaveBeenCalledWith(USER_ID, 'mobile', 1);
  });

  it('requires explicit linking instead of silently matching an existing email', async () => {
    const { service, mocks } = harness();
    mocks.verifyMobileIdToken.mockResolvedValue(proof());
    mocks.findBySubject.mockResolvedValue(null);
    mocks.findByEmail.mockResolvedValue(user());

    await expect(service.loginMobile('google-id-token')).resolves.toEqual({
      kind: 'link_required',
    });

    expect(mocks.createGoogleAccountIfEmailFree).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it('creates a Google-only account without a fake password', async () => {
    const { service, mocks } = harness();
    const googleOnly = user({ password_hash: undefined });

    mocks.verifyMobileIdToken.mockResolvedValue(proof());
    mocks.findBySubject.mockResolvedValue(null);
    mocks.findByEmail.mockResolvedValue(null);
    mocks.createGoogleAccountIfEmailFree.mockResolvedValue(googleOnly);
    mocks.link.mockResolvedValue({
      kind: 'linked',
      identity: {
        id: 'identity-1',
        provider: 'google',
        providerSubject: 'google-subject-1',
        userId: USER_ID,
        emailAtLink: 'student@gmail.com',
        linkedAt: new Date(),
      },
    });
    mocks.issueSession.mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      session: {
        id: 'session-1',
        clientType: 'mobile',
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        current: true,
      },
    });

    const result = await service.loginMobile('google-id-token');

    expect(result.kind).toBe('authenticated');
    expect(mocks.createGoogleAccountIfEmailFree).toHaveBeenCalledWith(
      'student@gmail.com',
      expect.any(Date),
    );
    expect(mocks.auditRecord).toHaveBeenCalledWith({
      event: 'auth.oauth.linked',
      userId: USER_ID,
    });
  });

  it('fails closed for third-party email Google accounts during new account creation', async () => {
    const { service, mocks } = harness();
    mocks.verifyMobileIdToken.mockResolvedValue(
      proof({ email: 'student@example.com' }),
    );
    mocks.findBySubject.mockResolvedValue(null);

    await expect(service.loginMobile('google-id-token')).resolves.toEqual({
      kind: 'failed',
    });

    expect(mocks.findByEmail).not.toHaveBeenCalled();
    expect(mocks.createGoogleAccountIfEmailFree).not.toHaveBeenCalled();
  });

  it('never lets unlink remove the last login method', async () => {
    const { service, mocks } = harness();
    mocks.findById.mockResolvedValue(user({ password_hash: undefined }));
    mocks.findForUser.mockResolvedValue({
      id: 'identity-1',
      provider: 'google',
      providerSubject: 'google-subject-1',
      userId: USER_ID,
      emailAtLink: 'student@gmail.com',
      linkedAt: new Date(),
    });

    await expect(service.unlink(USER_ID, 'unused')).resolves.toEqual({
      kind: 'would_lock_account',
    });

    expect(mocks.unlinkForUser).not.toHaveBeenCalled();
  });

  it('rejects linking a provider subject already owned by another account', async () => {
    const { service, mocks } = harness();
    mocks.verifyMobileIdToken.mockResolvedValue(proof());
    mocks.findById.mockResolvedValue(user());
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.link.mockResolvedValue({
      kind: 'subject_in_use',
      identity: {
        id: 'identity-2',
        provider: 'google',
        providerSubject: 'google-subject-1',
        userId: OTHER_USER_ID,
        emailAtLink: 'other@gmail.com',
        linkedAt: new Date(),
      },
    });

    await expect(
      service.linkMobile(USER_ID, 'current-password', 'google-id-token'),
    ).resolves.toEqual({
      kind: 'identity_already_linked',
    });
  });
  it('reports provider availability without leaking configuration', () => {
    const { service } = harness();

    expect(service.availability()).toEqual({
      webEnabled: true,
      mobileEnabled: true,
    });
  });

  it('fails Web start closed when the provider is disabled', async () => {
    const { service, provider, mocks } = harness();
    (provider.isWebEnabled as jest.Mock).mockReturnValue(false);

    await expect(service.startWebLogin('/dashboard')).resolves.toEqual({
      kind: 'unavailable',
    });
    expect(mocks.issueAttempt).not.toHaveBeenCalled();
  });

  it('starts Web login with a server-side OAuth attempt', async () => {
    const { service, mocks } = harness();
    const attempt = {
      state: 's'.repeat(43),
      nonce: 'n'.repeat(43),
      codeChallenge: 'c'.repeat(43),
      returnPath: '/dashboard',
    };
    mocks.issueAttempt.mockResolvedValue(attempt);
    mocks.createWebAuthorizationUrl.mockReturnValue(
      'https://accounts.google.com/o/oauth2/v2/auth?state=opaque',
    );

    await expect(service.startWebLogin('/dashboard')).resolves.toEqual({
      kind: 'started',
      authorizationUrl:
        'https://accounts.google.com/o/oauth2/v2/auth?state=opaque',
    });
    expect(mocks.issueAttempt).toHaveBeenCalledWith(
      'login',
      undefined,
      '/dashboard',
    );
  });

  it('requires live password reauthentication before starting a Web link', async () => {
    const { service, mocks } = harness();
    mocks.findById.mockResolvedValue(user());
    mocks.findForUser.mockResolvedValue(null);
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(
      service.startWebLink(USER_ID, 'wrong-password', '/settings/security'),
    ).resolves.toEqual({ kind: 'reauthentication_required' });

    expect(mocks.issueAttempt).not.toHaveBeenCalled();
  });

  it('starts a Web link only after active-account reauthentication', async () => {
    const { service, mocks } = harness();
    mocks.findById.mockResolvedValue(user());
    mocks.findForUser.mockResolvedValue(null);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.issueAttempt.mockResolvedValue({
      state: 's'.repeat(43),
      nonce: 'n'.repeat(43),
      codeChallenge: 'c'.repeat(43),
      returnPath: '/settings/security',
    });
    mocks.createWebAuthorizationUrl.mockReturnValue('https://google.test/auth');

    await expect(
      service.startWebLink(
        USER_ID,
        'current-password',
        '/settings/security',
      ),
    ).resolves.toEqual({
      kind: 'started',
      authorizationUrl: 'https://google.test/auth',
    });
    expect(mocks.issueAttempt).toHaveBeenCalledWith(
      'link',
      USER_ID,
      '/settings/security',
    );
  });

  it('consumes Web OAuth state once and handles provider cancellation', async () => {
    const { service, mocks } = harness();
    mocks.consume.mockResolvedValue({
      intent: 'login',
      returnPath: '/login',
      codeVerifier: 'v'.repeat(43),
    });

    await expect(
      service.completeWebCallback({
        state: 's'.repeat(43),
        providerError: 'access_denied',
      }),
    ).resolves.toEqual({
      returnPath: '/login',
      result: { kind: 'cancelled' },
    });
    expect(mocks.exchangeWebAuthorizationCode).not.toHaveBeenCalled();
  });

  it('rejects a Web callback when OAuth state is missing or stale', async () => {
    const { service, mocks } = harness();
    mocks.consume.mockResolvedValue(null);

    await expect(
      service.completeWebCallback({
        state: 's'.repeat(43),
        code: 'authorization-code',
      }),
    ).resolves.toEqual({
      returnPath: '/login',
      result: { kind: 'failed' },
    });
  });

  it('rejects a Web callback when nonce proof does not match', async () => {
    const { service, mocks } = harness();
    const attempt = {
      intent: 'login',
      returnPath: '/dashboard',
      codeVerifier: 'v'.repeat(43),
    };
    mocks.consume.mockResolvedValue(attempt);
    mocks.exchangeWebAuthorizationCode.mockResolvedValue(proof());
    mocks.nonceMatches.mockReturnValue(false);

    await expect(
      service.completeWebCallback({
        state: 's'.repeat(43),
        code: 'authorization-code',
      }),
    ).resolves.toEqual({
      returnPath: '/dashboard',
      result: { kind: 'failed' },
    });
  });

  it('finishes a valid Web login callback into the normal Web AuthSession', async () => {
    const { service, mocks } = harness();
    mocks.consume.mockResolvedValue({
      intent: 'login',
      returnPath: '/dashboard',
      codeVerifier: 'v'.repeat(43),
    });
    mocks.exchangeWebAuthorizationCode.mockResolvedValue(proof());
    mocks.nonceMatches.mockReturnValue(true);
    mocks.findBySubject.mockResolvedValue({
      id: 'identity-1',
      provider: 'google',
      providerSubject: 'google-subject-1',
      userId: USER_ID,
      emailAtLink: 'student@gmail.com',
      linkedAt: new Date(),
    });
    mocks.findById.mockResolvedValue(user());
    mocks.issueSession.mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      session: {
        id: 'session-web',
        clientType: 'web',
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        current: true,
      },
    });

    const outcome = await service.completeWebCallback({
      state: 's'.repeat(43),
      code: 'authorization-code',
    });

    expect(outcome.returnPath).toBe('/dashboard');
    expect(outcome.result.kind).toBe('authenticated');
    expect(mocks.issueSession).toHaveBeenCalledWith(USER_ID, 'web', 1);
  });

  it('fails Mobile Google login closed when provider verification throws', async () => {
    const { service, mocks } = harness();
    mocks.verifyMobileIdToken.mockRejectedValue(new Error('provider down'));

    await expect(service.loginMobile('bad-id-token')).resolves.toEqual({
      kind: 'failed',
    });
  });

  it('fails Mobile Google login closed when the provider is disabled', async () => {
    const { service, provider, mocks } = harness();
    (provider.isMobileEnabled as jest.Mock).mockReturnValue(false);

    await expect(service.loginMobile('id-token')).resolves.toEqual({
      kind: 'unavailable',
    });
    expect(mocks.verifyMobileIdToken).not.toHaveBeenCalled();
  });

  it('rejects Mobile linking when the account is restricted', async () => {
    const { service, mocks } = harness();
    mocks.findById.mockResolvedValue(user({ account_status: 'restricted' }));

    await expect(
      service.linkMobile(USER_ID, 'current-password', 'id-token'),
    ).resolves.toEqual({ kind: 'account_restricted' });
    expect(mocks.verifyMobileIdToken).not.toHaveBeenCalled();
  });

  it('returns login methods from live account and linked identity state', async () => {
    const { service, mocks } = harness();
    mocks.findById.mockResolvedValue(user());
    mocks.findForUser.mockResolvedValue({
      id: 'identity-1',
      provider: 'google',
      providerSubject: 'google-subject-1',
      userId: USER_ID,
      emailAtLink: 'student@gmail.com',
      linkedAt: new Date(),
    });

    await expect(service.loginMethods(USER_ID)).resolves.toEqual({
      passwordConfigured: true,
      googleConnected: true,
    });
  });

  it('returns null login methods for a disappeared account', async () => {
    const { service, mocks } = harness();
    mocks.findById.mockResolvedValue(null);
    mocks.findForUser.mockResolvedValue(null);

    await expect(service.loginMethods(USER_ID)).resolves.toBeNull();
  });

  it('requires the current password before unlinking Google', async () => {
    const { service, mocks } = harness();
    mocks.findById.mockResolvedValue(user());
    mocks.findForUser.mockResolvedValue({
      id: 'identity-1',
      provider: 'google',
      providerSubject: 'google-subject-1',
      userId: USER_ID,
      emailAtLink: 'student@gmail.com',
      linkedAt: new Date(),
    });
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(service.unlink(USER_ID, 'wrong-password')).resolves.toEqual({
      kind: 'reauthentication_required',
    });
    expect(mocks.unlinkForUser).not.toHaveBeenCalled();
  });

  it('unlinks Google after reauthentication and records the security event', async () => {
    const { service, mocks } = harness();
    mocks.findById.mockResolvedValue(user());
    mocks.findForUser.mockResolvedValue({
      id: 'identity-1',
      provider: 'google',
      providerSubject: 'google-subject-1',
      userId: USER_ID,
      emailAtLink: 'student@gmail.com',
      linkedAt: new Date(),
    });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.unlinkForUser.mockResolvedValue(true);

    await expect(
      service.unlink(USER_ID, 'current-password'),
    ).resolves.toEqual({ kind: 'unlinked' });
    expect(mocks.auditRecord).toHaveBeenCalledWith({
      event: 'auth.oauth.unlinked',
      userId: USER_ID,
    });
  });

  it('fails Web link start closed when Google is disabled', async () => {
    const { service, provider, mocks } = harness();
    (provider.isWebEnabled as jest.Mock).mockReturnValue(false);

    await expect(
      service.startWebLink(USER_ID, 'current-password', '/settings/security'),
    ).resolves.toEqual({ kind: 'unavailable' });
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('does not start Web linking for a missing or restricted account', async () => {
    const missing = harness();
    missing.mocks.findById.mockResolvedValue(null);
    await expect(
      missing.service.startWebLink(
        USER_ID,
        'current-password',
        '/settings/security',
      ),
    ).resolves.toEqual({ kind: 'reauthentication_required' });

    const restricted = harness();
    restricted.mocks.findById.mockResolvedValue(
      user({ account_status: 'restricted' }),
    );
    await expect(
      restricted.service.startWebLink(
        USER_ID,
        'current-password',
        '/settings/security',
      ),
    ).resolves.toEqual({ kind: 'account_restricted' });
  });

  it('does not start a duplicate Web link when Google is already connected', async () => {
    const { service, mocks } = harness();
    mocks.findById.mockResolvedValue(user());
    mocks.findForUser.mockResolvedValue({
      id: 'identity-1',
      provider: 'google',
      providerSubject: 'google-subject-1',
      userId: USER_ID,
      emailAtLink: 'student@gmail.com',
      linkedAt: new Date(),
    });

    await expect(
      service.startWebLink(USER_ID, 'current-password', '/settings/security'),
    ).resolves.toEqual({ kind: 'already_linked' });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it('fails a Web callback closed when provider exchange fails', async () => {
    const { service, mocks } = harness();
    mocks.consume.mockResolvedValue({
      intent: 'login',
      returnPath: '/dashboard',
      codeVerifier: 'v'.repeat(43),
    });
    mocks.exchangeWebAuthorizationCode.mockRejectedValue(
      new Error('provider unavailable'),
    );

    await expect(
      service.completeWebCallback({
        state: 's'.repeat(43),
        code: 'authorization-code',
      }),
    ).resolves.toEqual({
      returnPath: '/dashboard',
      result: { kind: 'failed' },
    });
  });

  it('fails a malformed link callback that has no bound account', async () => {
    const { service, mocks } = harness();
    mocks.consume.mockResolvedValue({
      intent: 'link',
      userId: undefined,
      returnPath: '/settings/security',
      codeVerifier: 'v'.repeat(43),
    });
    mocks.exchangeWebAuthorizationCode.mockResolvedValue(proof());
    mocks.nonceMatches.mockReturnValue(true);

    await expect(
      service.completeWebCallback({
        state: 's'.repeat(43),
        code: 'authorization-code',
      }),
    ).resolves.toEqual({
      returnPath: '/settings/security',
      result: { kind: 'failed' },
    });
  });

  it('keeps unlink idempotent when no Google identity remains', async () => {
    const { service, mocks } = harness();
    mocks.findById.mockResolvedValue(user());
    mocks.findForUser.mockResolvedValue(null);

    await expect(service.unlink(USER_ID, 'current-password')).resolves.toEqual({
      kind: 'not_linked',
    });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it('blocks unlink for a restricted account before identity mutation', async () => {
    const { service, mocks } = harness();
    mocks.findById.mockResolvedValue(user({ account_status: 'restricted' }));

    await expect(service.unlink(USER_ID, 'current-password')).resolves.toEqual({
      kind: 'account_restricted',
    });
    expect(mocks.findForUser).not.toHaveBeenCalled();
  });

});
