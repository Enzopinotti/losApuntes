import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthSessionService } from './session/auth-session.service';
import type {
  AuthClientType,
  PublicAuthSession,
} from './session/auth-session.types';

export type AuthLoginResult = {
  user: AuthenticatedUser;
  sessionToken: string;
  session: PublicAuthSession;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessions: AuthSessionService,
  ) {}

  async register(dto: RegisterDto): Promise<void> {
    const hash = await bcrypt.hash(dto.password, 12);
    await this.usersService.createPasswordAccountIfAbsent(dto.email, hash);
  }

  async validateUser(email: string, pass: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;

    const passwordMatches = await bcrypt.compare(pass, user.password_hash);
    return passwordMatches ? user : null;
  }

  async login(
    dto: LoginDto,
    clientType: AuthClientType,
  ): Promise<AuthLoginResult | null> {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) return null;

    const issued = await this.sessions.issue(
      user._id.toString(),
      clientType,
    );

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
      },
      sessionToken: issued.sessionToken,
      session: issued.session,
    };
  }
}
