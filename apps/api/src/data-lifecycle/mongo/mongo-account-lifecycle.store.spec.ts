import { MongoAccountLifecycleStore } from './mongo-account-lifecycle.store';

const now = new Date('2026-10-01T23:00:00.000Z');
const userId = '507f1f77bcf86cd799439011';

function query<T>(value: T) {
  return {
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function listQuery<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function fixture(
  input: {
    manager?: unknown;
    user?: unknown;
    managers?: unknown[];
  } = {},
) {
  const activeSession = {
    withTransaction: jest.fn(async (callback: () => Promise<void>) =>
      callback(),
    ),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  const connection = {
    startSession: jest.fn().mockResolvedValue(activeSession),
  };
  const users = {
    findOneAndUpdate: jest.fn(() =>
      query(input.user === undefined ? { _id: userId } : input.user),
    ),
  };
  const profiles = {
    updateOne: jest.fn(() => query({ modifiedCount: 1 })),
  };
  const managers = {
    find: jest.fn(() => listQuery(input.managers ?? [])),
    findOne: jest.fn(() =>
      query(input.manager === undefined ? null : input.manager),
    ),
  };
  const jobs = {
    updateOne: jest.fn(() => query({ modifiedCount: 1 })),
    findOneAndUpdate: jest.fn(() => query(null)),
    exists: jest.fn().mockResolvedValue(null),
  };
  const audits = {
    create: jest.fn().mockResolvedValue([]),
  };

  const store = new MongoAccountLifecycleStore(
    connection as never,
    users as never,
    profiles as never,
    managers as never,
    jobs as never,
    audits as never,
  );

  return {
    store,
    activeSession,
    users,
    profiles,
    managers,
    jobs,
    audits,
  };
}

describe('MongoAccountLifecycleStore', () => {
  it('returns a bounded honest management blocker inventory', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      organizationId: `org-${String(index).padStart(2, '0')}`,
      userId,
      role: index === 0 ? ('owner' as const) : ('editor' as const),
      createdAt: now,
      updatedAt: now,
    }));
    const f = fixture({ managers: rows });

    await expect(f.store.listManagementBlockers(userId, 20)).resolves.toEqual({
      items: rows.slice(0, 20).map((row) => ({
        organizationId: row.organizationId,
        role: row.role,
      })),
      truncated: true,
    });
  });

  it('does not partially close an account that still manages an organization', async () => {
    const f = fixture({
      manager: {
        organizationId: 'org-1',
        userId,
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      },
    });

    await expect(
      f.store.closeAccount({
        userId,
        expectedCredentialVersion: 4,
        now,
        auditId: 'audit-1',
        cleanupJobId: 'job-1',
      }),
    ).resolves.toEqual({ status: 'manager_blocked' });

    expect(f.users.findOneAndUpdate).not.toHaveBeenCalled();
    expect(f.profiles.updateOne).not.toHaveBeenCalled();
    expect(f.jobs.updateOne).not.toHaveBeenCalled();
    expect(f.audits.create).not.toHaveBeenCalled();
  });

  it('commits authority shutdown, profile tombstone, durable job and audit together', async () => {
    const f = fixture();

    await expect(
      f.store.closeAccount({
        userId,
        expectedCredentialVersion: 4,
        now,
        auditId: 'audit-1',
        cleanupJobId: 'job-1',
      }),
    ).resolves.toEqual({ status: 'closed', cleanupJobId: 'job-1' });

    expect(f.users.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: userId,
        $and: [
          {
            $or: [
              { account_status: 'active' },
              { account_status: { $exists: false } },
            ],
          },
          { credential_version: 4 },
        ],
      },
      {
        $set: {
          account_status: 'closed',
          account_closed_at: now,
          credential_version: 5,
        },
      },
      { new: true, session: f.activeSession },
    );
    expect(f.profiles.updateOne).toHaveBeenCalledWith(
      { userId },
      {
        $set: { lifecycleState: 'closed' },
        $inc: { revision: 1 },
      },
      { session: f.activeSession },
    );
    expect(f.jobs.updateOne).toHaveBeenCalledWith(
      { userId },
      {
        $setOnInsert: {
          id: 'job-1',
          userId,
          state: 'pending',
          attempts: 0,
          nextAttemptAt: now,
          claimId: null,
          leaseExpiresAt: null,
          failureCode: null,
          completedAt: null,
        },
      },
      { upsert: true, session: f.activeSession },
    );
    expect(f.audits.create).toHaveBeenCalledWith(
      [
        {
          id: 'audit-1',
          event: 'account.closed',
          actorUserId: userId,
          subjectUserId: userId,
          metadata: {
            source: 'self_service',
            cleanupJobId: 'job-1',
          },
          createdAt: now,
        },
      ],
      { session: f.activeSession },
    );
    expect(f.activeSession.withTransaction).toHaveBeenCalledTimes(1);
  });

  it('keeps terminal cleanup failures visible to worker health', async () => {
    const f = fixture();
    f.jobs.exists.mockResolvedValue({ _id: 'failed-job' });

    await expect(f.store.hasFailedCleanup()).resolves.toBe(true);
    expect(f.jobs.exists).toHaveBeenCalledWith({ state: 'failed' });
  });
});
