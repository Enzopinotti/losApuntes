import * as bcrypt from 'bcrypt';

import { PASSWORD_HASH_SCHEME, PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('stores new passwords with the versioned PBKDF2 scheme', async () => {
    const password = 'correct horse battery staple 2026';
    const passwordHash = await service.hash(password);

    expect(passwordHash.startsWith(`${PASSWORD_HASH_SCHEME}$`)).toBe(true);
    expect(passwordHash).not.toContain(password);
    await expect(service.verify(password, passwordHash)).resolves.toBe(true);
    await expect(
      service.verify('wrong correct horse battery staple 2026', passwordHash),
    ).resolves.toBe(false);
  });

  it('verifies the entire password instead of collapsing after bcrypt byte 72', async () => {
    const sharedPrefix = 'a'.repeat(72);
    const first = `${sharedPrefix}-first-secret-suffix`;
    const second = `${sharedPrefix}-second-secret-suffix`;
    const passwordHash = await service.hash(first);

    await expect(service.verify(first, passwordHash)).resolves.toBe(true);
    await expect(service.verify(second, passwordHash)).resolves.toBe(false);
  });

  it('normalizes new Unicode passwords with NFC before derivation', async () => {
    const decomposed = `Cafe\u0301-${'academico '.repeat(2)}2026`;
    const composed = decomposed.normalize('NFC');
    const passwordHash = await service.hash(decomposed);

    expect(decomposed).not.toBe(composed);
    await expect(service.verify(composed, passwordHash)).resolves.toBe(true);
  });

  it('keeps bounded legacy bcrypt compatibility for migration', async () => {
    const password = 'legacy-password-2026';
    const passwordHash = await bcrypt.hash(password, 4);

    await expect(service.verify(password, passwordHash)).resolves.toBe(true);
    expect(service.needsRehash(passwordHash)).toBe(true);
  });

  it('fails closed for ambiguous legacy bcrypt inputs beyond 72 UTF-8 bytes', async () => {
    const bcryptPrefix = 'a'.repeat(72);
    const legacyHash = await bcrypt.hash(bcryptPrefix, 4);

    await expect(
      service.verify(`${bcryptPrefix}-suffix`, legacyHash),
    ).resolves.toBe(false);
    await expect(service.verify(bcryptPrefix, legacyHash)).resolves.toBe(true);
  });

  it('rejects unknown or malformed stored hash formats', async () => {
    await expect(
      service.verify('valid-looking-password', 'sha256:not-a-password-hash'),
    ).resolves.toBe(false);
    await expect(
      service.verify(
        'valid-looking-password',
        'pbkdf2-sha256$999999999$bad$bad',
      ),
    ).resolves.toBe(false);
    expect(service.needsRehash('not-a-hash')).toBe(false);
  });
});
