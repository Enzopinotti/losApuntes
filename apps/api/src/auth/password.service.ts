import * as bcrypt from 'bcrypt';
import {
  pbkdf2 as pbkdf2Callback,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const PBKDF2_DIGEST = 'sha256';
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEY_BYTES = 32;
const PBKDF2_SALT_BYTES = 16;
const LEGACY_BCRYPT_MAX_BYTES = 72;

const PBKDF2_HASH_PATTERN =
  /^pbkdf2-sha256\$(\d+)\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/u;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/u;
const DUMMY_PASSWORD_HASH =
  'pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const pbkdf2 = promisify(pbkdf2Callback);

type ParsedPbkdf2Hash = {
  iterations: number;
  salt: Buffer;
  digest: Buffer;
};

function normalizePassword(password: string): string {
  return password.normalize('NFC');
}

function parsePbkdf2Hash(passwordHash: string): ParsedPbkdf2Hash | null {
  const match = PBKDF2_HASH_PATTERN.exec(passwordHash);
  if (!match) return null;

  const iterations = Number(match[1]);
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 1_000_000
  ) {
    return null;
  }

  const salt = Buffer.from(match[2] ?? '', 'base64url');
  const digest = Buffer.from(match[3] ?? '', 'base64url');

  if (salt.length !== PBKDF2_SALT_BYTES || digest.length !== PBKDF2_KEY_BYTES) {
    return null;
  }

  return {
    iterations,
    salt,
    digest,
  };
}

async function derivePbkdf2(
  password: string,
  salt: Buffer,
  iterations: number,
): Promise<Buffer> {
  return pbkdf2(
    normalizePassword(password),
    salt,
    iterations,
    PBKDF2_KEY_BYTES,
    PBKDF2_DIGEST,
  );
}

export const PASSWORD_HASH_SCHEME = 'pbkdf2-sha256';

export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(PBKDF2_SALT_BYTES);
    const digest = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);

    return [
      PASSWORD_HASH_SCHEME,
      PBKDF2_ITERATIONS.toString(10),
      salt.toString('base64url'),
      digest.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    const parsed = parsePbkdf2Hash(passwordHash);

    if (parsed) {
      const candidate = await derivePbkdf2(
        password,
        parsed.salt,
        parsed.iterations,
      );

      return timingSafeEqual(candidate, parsed.digest);
    }

    if (!BCRYPT_HASH_PATTERN.test(passwordHash)) {
      return false;
    }

    if (Buffer.byteLength(password, 'utf8') > LEGACY_BCRYPT_MAX_BYTES) {
      return false;
    }

    return bcrypt.compare(password, passwordHash);
  }

  async consumeVerificationCost(password: string): Promise<void> {
    await this.verify(password, DUMMY_PASSWORD_HASH);
  }

  needsRehash(passwordHash: string): boolean {
    if (BCRYPT_HASH_PATTERN.test(passwordHash)) {
      return true;
    }

    const parsed = parsePbkdf2Hash(passwordHash);
    return Boolean(parsed && parsed.iterations !== PBKDF2_ITERATIONS);
  }
}
