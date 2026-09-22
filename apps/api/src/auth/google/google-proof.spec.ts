import {
  isGoogleAuthoritativeMailbox,
  normalizeGoogleEmail,
  validGoogleProof,
} from './google-proof';

describe('Google identity proof policy', () => {
  it('normalizes email without changing stable provider identity', () => {
    expect(normalizeGoogleEmail(' Student@GMAIL.com ')).toBe(
      'student@gmail.com',
    );
  });

  it('accepts verified Gmail and hosted Workspace mailbox authority', () => {
    expect(
      isGoogleAuthoritativeMailbox({
        subject: 'google-sub-1',
        email: 'student@gmail.com',
        emailVerified: true,
      }),
    ).toBe(true);

    expect(
      isGoogleAuthoritativeMailbox({
        subject: 'google-sub-2',
        email: 'student@university.edu',
        emailVerified: true,
        hostedDomain: 'university.edu',
      }),
    ).toBe(true);
  });

  it('fails closed for an unverified or third-party mailbox during creation/link', () => {
    expect(
      isGoogleAuthoritativeMailbox({
        subject: 'google-sub-3',
        email: 'student@gmail.com',
        emailVerified: false,
      }),
    ).toBe(false);

    expect(
      isGoogleAuthoritativeMailbox({
        subject: 'google-sub-4',
        email: 'student@example.com',
        emailVerified: true,
      }),
    ).toBe(false);
  });

  it('requires subject, email and verified claim in a normalized proof', () => {
    expect(
      validGoogleProof({
        subject: '',
        email: 'student@gmail.com',
        emailVerified: true,
      }),
    ).toBe(false);

    expect(
      validGoogleProof({
        subject: 'google-sub-5',
        email: '',
        emailVerified: true,
      }),
    ).toBe(false);

    expect(
      validGoogleProof({
        subject: 'google-sub-6',
        email: 'student@gmail.com',
        emailVerified: false,
      }),
    ).toBe(false);
  });
});
