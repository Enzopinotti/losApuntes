import type { User } from './schemas/user.schema';

type UserSecurityFields = Pick<
  User,
  'credential_version' | 'email_verified_at'
>;

export function credentialVersion(user: UserSecurityFields): number {
  const version = user.credential_version;

  return typeof version === 'number' &&
    Number.isInteger(version) &&
    version >= 1
    ? version
    : 1;
}

export function isEmailVerified(user: UserSecurityFields): boolean {
  if (user.email_verified_at === undefined) {
    return true;
  }

  return user.email_verified_at instanceof Date;
}
