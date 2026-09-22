import { credentialVersion, isEmailVerified } from './user-security-state';

describe('user security state compatibility', () => {
  it('treats legacy users without a credential version as version 1', () => {
    expect(
      credentialVersion({
        credential_version: undefined,
        email_verified_at: undefined,
      }),
    ).toBe(1);
  });

  it('uses an explicit positive credential version', () => {
    expect(
      credentialVersion({
        credential_version: 3,
        email_verified_at: undefined,
      }),
    ).toBe(3);
  });

  it('treats legacy users without verification state as already verified', () => {
    expect(
      isEmailVerified({
        credential_version: undefined,
        email_verified_at: undefined,
      }),
    ).toBe(true);
  });

  it('distinguishes a new pending account from a verified account', () => {
    expect(
      isEmailVerified({
        credential_version: 1,
        email_verified_at: null,
      }),
    ).toBe(false);

    expect(
      isEmailVerified({
        credential_version: 1,
        email_verified_at: new Date('2026-09-22T14:00:00.000Z'),
      }),
    ).toBe(true);
  });
});
