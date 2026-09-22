import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordCodePointLength,
  passwordPolicyViolation,
} from './password-policy';

describe('password policy', () => {
  it('counts Unicode code points after NFC normalization', () => {
    expect(passwordCodePointLength('e\u0301'.repeat(15))).toBe(15);
    expect(passwordCodePointLength('é'.repeat(15))).toBe(15);
  });

  it('requires at least 15 code points without composition rules', () => {
    expect(passwordPolicyViolation('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(
      'too_short',
    );
    expect(passwordPolicyViolation('correct horse battery staple')).toBeNull();
    expect(passwordPolicyViolation('frase con espacios suficientemente larga')).toBeNull();
  });

  it('rejects values beyond the bounded maximum', () => {
    expect(passwordPolicyViolation('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe(
      'too_long',
    );
  });

  it('rejects common and product-context passwords case-insensitively', () => {
    expect(passwordPolicyViolation('PASSWORDPASSWORD')).toBe('common_password');
    expect(passwordPolicyViolation('LOSAPUNTES123456')).toBe('common_password');
  });

  it('compares the complete normalized password, not substrings', () => {
    expect(passwordPolicyViolation('prefix-password123456-suffix')).toBeNull();
  });
});
