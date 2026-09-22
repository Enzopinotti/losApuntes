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

function user(
  overrides: Partial<UserDocument> = {},
): UserDocument {
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

function proof(overrides: Partial<GoogleIdentityProof> = {}): GoogleIdentityProof {
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
});
