export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 256;

const COMMON_PASSWORDS = new Set(
  [
    '123456789012345',
    '1234567890123456',
    'abcdefghijklmnop',
    'adminadminadmin',
    'iloveyouiloveyou',
    'letmeinletmein123',
    'losapuntes123456',
    'losapuntes2026',
    'password123456',
    'passwordpassword',
    'qwertyqwerty123',
    'qwertyuiopasdfgh',
    'welcome123456789',
  ].map((password) => password.normalize('NFC').toLowerCase()),
);

export type PasswordPolicyViolation =
  'too_short' | 'too_long' | 'common_password';

export function passwordCodePointLength(password: string): number {
  return Array.from(password.normalize('NFC')).length;
}

export function passwordPolicyViolation(
  password: string,
): PasswordPolicyViolation | null {
  const normalized = password.normalize('NFC');
  const length = Array.from(normalized).length;

  if (length < PASSWORD_MIN_LENGTH) {
    return 'too_short';
  }

  if (length > PASSWORD_MAX_LENGTH) {
    return 'too_long';
  }

  if (COMMON_PASSWORDS.has(normalized.toLowerCase())) {
    return 'common_password';
  }

  return null;
}
