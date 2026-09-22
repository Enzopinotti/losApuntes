import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const usersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
  };

  const jwtService = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('hashes the password and signs the created user', async () => {
    usersService.create.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      role: 'user',
    });
    jwtService.sign.mockReturnValue('signed-token');

    const result = await service.register({
      username: 'enzo',
      email: 'enzo@example.com',
      password: 'correct-horse',
    });

    expect(usersService.create).toHaveBeenCalledTimes(1);
    const created = usersService.create.mock.calls[0][0];
    expect(created).toMatchObject({
      username: 'enzo',
      email: 'enzo@example.com',
    });
    expect(created.password_hash).not.toBe('correct-horse');
    await expect(
      bcrypt.compare('correct-horse', created.password_hash),
    ).resolves.toBe(true);
    expect(jwtService.sign).toHaveBeenCalledWith(
      { sub: 'user-1', role: 'user' },
      { expiresIn: '15m' },
    );
    expect(result).toEqual({ access_token: 'signed-token' });
  });

  it('rejects login when the user does not exist', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'missing@example.com',
        password: 'not-a-real-password',
      }),
    ).rejects.toThrow('Unauthorized');

    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('rejects login when the password does not match', async () => {
    const passwordHash = await bcrypt.hash('real-password', 4);
    usersService.findByEmail.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      role: 'user',
      password_hash: passwordHash,
    });

    await expect(
      service.login({
        email: 'enzo@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toThrow('Unauthorized');

    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('signs a valid login', async () => {
    const passwordHash = await bcrypt.hash('real-password', 4);
    usersService.findByEmail.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      role: 'user',
      password_hash: passwordHash,
    });
    jwtService.sign.mockReturnValue('signed-token');

    await expect(
      service.login({
        email: 'enzo@example.com',
        password: 'real-password',
      }),
    ).resolves.toEqual({ access_token: 'signed-token' });

    expect(jwtService.sign).toHaveBeenCalledWith(
      { sub: 'user-1', role: 'user' },
      { expiresIn: '15m' },
    );
  });
});
