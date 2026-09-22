import { Injectable } from '@nestjs/common';
import type { UserDocument } from '../users/schemas/user.schema';
import {
  credentialVersion,
  isAccountActive,
  isEmailVerified,
} from '../users/user-security-state';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthLifecycleService } from './lifecycle/auth-lifecycle.service';
import { PasswordService } from './password.service';
import { AuthSessionService } from './session/auth-session.service';
import type {
  AuthClientType,
  PublicAuthSession,
} from './session/auth-session.types';

export type AuthenticatedLoginOutcome = {
  kind: 'authenticated';
  user: AuthenticatedUser;
  sessionToken: string;
  session: PublicAuthSession;
};

export type AuthLoginOutcome =
  | AuthenticatedLoginOutcome
  | { kind: 'invalid_credentials' }
  | { kind: 'email_verification_required' }
  | { kind: 'account_restricted' };

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessions: AuthSessionService,
    private readonly lifecycle: AuthLifecycleService,
    private readonly passwords: PasswordService,
  ) {}

  async register(dto: RegisterDto): Promise<void> {
    const hash = await this.passwords.hash(dto.password);
    await this.usersService.createPasswordAccountIfAbsent(dto.email, hash);
    await this.lifecycle.requestEmailVerification(dto.email);
  }

  async validateUser(email: string, pass: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user?.password_hash) return null;

    const passwordMatches = await this.passwords.verify(
      pass,
      user.password_hash,
    );

    if (!passwordMatches) {
      return null;
    }

    await this.upgradeLegacyPasswordHash(user, pass);
    return user;
  }

  async login(
    dto: LoginDto,
    clientType: AuthClientType,
  ): Promise<AuthLoginOutcome> {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) return { kind: 'invalid_credentials' };

    if (!isAccountActive(user)) {
      return { kind: 'account_restricted' };
    }

    if (!isEmailVerified(user)) {
      return { kind: 'email_verification_required' };
    }

    const issued = await this.sessions.issue(
      user._id.toString(),
      clientType,
      credentialVersion(user),
    );

    return {
      kind: 'authenticated',
      user: {
        id: user._id.toString(),
        email: user.email,
      },
      sessionToken: issued.sessionToken,
      session: issued.session,
    };
  }

  private async upgradeLegacyPasswordHash(
    user: UserDocument,
    password: string,
  ): Promise<void> {
    const currentHash = user.password_hash;
    if (!currentHash || !this.passwords.needsRehash(currentHash)) {
      return;
    }

    try {
      const replacementHash = await this.passwords.hash(password);
      await this.usersService.replacePasswordHashIfCurrent(
        user._id.toString(),
        currentHash,
        replacementHash,
      );
    } catch {
      // Hash migration is best-effort and must never turn valid proof into login failure.
    }
  }
}
