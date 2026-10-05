import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

import { User } from './schemas/user.schema';
import {
  USER_ACCOUNT_EXPORT_SELECT,
  UsersService,
} from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const exec = jest.fn();
  const exportExec = jest.fn();
  const updateExec = jest.fn();
  const exportQuery = {
    select: jest.fn(),
    lean: jest.fn(),
    exec: exportExec,
  };
  exportQuery.select.mockReturnValue(exportQuery);
  exportQuery.lean.mockReturnValue(exportQuery);

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

  it('exports account identity from an explicit secret-free allowlist', async () => {
    userModel.findById.mockReturnValueOnce(exportQuery);
    exportExec.mockResolvedValue({
      _id: 'user-1',
      email: 'enzo@example.com',
      username: 'enzo',
      email_verified_at: new Date('2026-09-01T12:00:00.000Z'),
      account_status: 'restricted',
      account_closed_at: null,
      full_name: 'Enzo Pinotti',
      avatar_url: null,
      bio: 'Bio',
      career_id: 42,
      cohort_year: 2026,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T12:00:00.000Z'),
    });

    await expect(
      service.getAccountExportProjection('user-1'),
    ).resolves.toEqual({
      id: 'user-1',
      email: 'enzo@example.com',
      username: 'enzo',
      emailVerifiedAt: '2026-09-01T12:00:00.000Z',
      accountStatus: 'restricted',
      accountClosedAt: null,
      fullName: 'Enzo Pinotti',
      avatarUrl: null,
      bio: 'Bio',
      careerId: 42,
      cohortYear: 2026,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
    });

    expect(userModel.findById).toHaveBeenLastCalledWith('user-1');
    expect(exportQuery.select).toHaveBeenCalledWith(USER_ACCOUNT_EXPORT_SELECT);
    expect(USER_ACCOUNT_EXPORT_SELECT).not.toHaveProperty('password_hash');
    expect(USER_ACCOUNT_EXPORT_SELECT).not.toHaveProperty(
      'credential_version',
    );
    expect(USER_ACCOUNT_EXPORT_SELECT).not.toHaveProperty(
      'management_authority_revision',
    );
    expect(USER_ACCOUNT_EXPORT_SELECT).not.toHaveProperty(
      'account_lifecycle_revision',
    );
    expect(USER_ACCOUNT_EXPORT_SELECT).not.toHaveProperty(
      'platform_permissions',
    );
  });

  it('serializes missing account-export optionals as null', async () => {
    userModel.findById.mockReturnValueOnce(exportQuery);
    exportExec.mockResolvedValue({
      _id: 'user-2',
      email: 'new@example.com',
    });

    await expect(
      service.getAccountExportProjection('user-2'),
    ).resolves.toEqual({
      id: 'user-2',
      email: 'new@example.com',
      username: null,
      emailVerifiedAt: null,
      accountStatus: 'active',
      accountClosedAt: null,
      fullName: null,
      avatarUrl: null,
      bio: null,
      careerId: null,
      cohortYear: null,
      createdAt: null,
      updatedAt: null,
    });
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
