import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

import { User } from './schemas/user.schema';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const exec = jest.fn();
  const updateExec = jest.fn();
  const userModel = {
    create: jest.fn(),
    findOne: jest.fn(() => ({ exec })),
    findById: jest.fn(() => ({ exec })),
    updateOne: jest.fn(() => ({ exec: updateExec })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('creates a user with the supplied persistence payload', async () => {
    const user = { email: 'enzo@example.com' };
    userModel.create.mockResolvedValue(user);

    await expect(service.create(user)).resolves.toBe(user);
    expect(userModel.create).toHaveBeenCalledWith(user);
  });

  it('queries users by normalized email field', async () => {
    const user = { email: 'enzo@example.com' };
    exec.mockResolvedValue(user);

    await expect(service.findByEmail('enzo@example.com')).resolves.toBe(user);
    expect(userModel.findOne).toHaveBeenCalledWith({
      email: 'enzo@example.com',
    });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('queries users by id', async () => {
    const user = { email: 'enzo@example.com' };
    exec.mockResolvedValue(user);

    await expect(service.findById('user-1')).resolves.toBe(user);
    expect(userModel.findById).toHaveBeenCalledWith('user-1');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('migrates only the exact current password hash without changing credential authority', async () => {
    updateExec.mockResolvedValue({ modifiedCount: 1 });

    await expect(
      service.replacePasswordHashIfCurrent(
        'user-1',
        'legacy-hash',
        'current-hash',
      ),
    ).resolves.toBe(true);

    expect(userModel.updateOne).toHaveBeenCalledWith(
      {
        _id: 'user-1',
        password_hash: 'legacy-hash',
      },
      {
        $set: {
          password_hash: 'current-hash',
        },
      },
    );
  });

  it('reports a lost hash-migration race without overwriting newer credentials', async () => {
    updateExec.mockResolvedValue({ modifiedCount: 0 });

    await expect(
      service.replacePasswordHashIfCurrent(
        'user-1',
        'stale-hash',
        'replacement-hash',
      ),
    ).resolves.toBe(false);
  });
});
