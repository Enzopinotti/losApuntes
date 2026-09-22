import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const hash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      username: dto.username,
      email: dto.email,
      password_hash: hash,
    });
    return this.sign(user.id, user.role);
  }

  async validateUser(email: string, pass: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const ok = await bcrypt.compare(pass, user.password_hash);
    return ok ? user : null;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException();
    return this.sign(user.id, user.role);
  }

  private sign(sub: string, role: string) {
    const payload = { sub, role };
    return { access_token: this.jwt.sign(payload, { expiresIn: '15m' }) };
  }
}
