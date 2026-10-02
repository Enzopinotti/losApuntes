import type { User } from './schemas/user.schema';

export type AccountStatus = 'active' | 'restricted' | 'closed';

type UserSecurityFields = Pick<
  User,
  'credential_version' | 'email_verified_at' | 'account_status'
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

export function accountStatus(user: UserSecurityFields): AccountStatus {
  if (user.account_status === 'restricted') return 'restricted';
  if (user.account_status === 'closed') return 'closed';
  return 'active';
}

export function isAccountClosed(user: UserSecurityFields): boolean {
  return accountStatus(user) === 'closed';
}

export function isAccountActive(user: UserSecurityFields): boolean {
  return accountStatus(user) === 'active';
}
