import {
  accountStatus,
  credentialVersion,
  isAccountActive,
  isEmailVerified,
} from './user-security-state';

describe('user security state compatibility', () => {
  it('treats legacy users without a credential version as version 1', () => {
    expect(
      credentialVersion({
        credential_version: undefined,
        email_verified_at: undefined,
        account_status: undefined,
      }),
    ).toBe(1);
  });

  it('uses an explicit positive credential version', () => {
    expect(
      credentialVersion({
        credential_version: 3,
        email_verified_at: undefined,
        account_status: undefined,
      }),
    ).toBe(3);
  });

  it('treats legacy users without verification state as already verified', () => {
    expect(
      isEmailVerified({
        credential_version: undefined,
        email_verified_at: undefined,
        account_status: undefined,
      }),
    ).toBe(true);
  });

  it('distinguishes a new pending account from a verified account', () => {
    expect(
      isEmailVerified({
        credential_version: 1,
        email_verified_at: null,
        account_status: undefined,
      }),
    ).toBe(false);

    expect(
      isEmailVerified({
        credential_version: 1,
        email_verified_at: new Date('2026-09-22T14:00:00.000Z'),
        account_status: undefined,
      }),
    ).toBe(true);
  });

  it('treats legacy users without account_status as active', () => {
    const user = {
      credential_version: 1,
      email_verified_at: new Date('2026-09-22T14:00:00.000Z'),
      account_status: undefined,
    };

    expect(accountStatus(user)).toBe('active');
    expect(isAccountActive(user)).toBe(true);
  });

  it('treats explicit restricted state as inactive', () => {
    const user = {
      credential_version: 1,
      email_verified_at: new Date('2026-09-22T14:00:00.000Z'),
      account_status: 'restricted' as const,
    };

    expect(accountStatus(user)).toBe('restricted');
    expect(isAccountActive(user)).toBe(false);
  });
});
