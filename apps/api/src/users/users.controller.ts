import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthSessionGuard } from '../auth/guards/auth-session.guard';

@Controller('users')
export class UsersController {
  @UseGuards(AuthSessionGuard)
  @Get('profile')
  getProfile() {
    return { message: 'Ruta protegida por sesión revocable' };
  }
}
