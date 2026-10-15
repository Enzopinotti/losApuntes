import { randomUUID } from 'node:crypto';
import { createConnection, type Connection, type Model } from 'mongoose';

import {
  MongoAccountLifecycleStore,
} from '../../data-lifecycle/mongo/mongo-account-lifecycle.store';
import {
  AccountOffboardingJob,
  AccountOffboardingJobSchema,
  SecurityAudit,
  SecurityAuditSchema,
} from '../../data-lifecycle/mongo/data-lifecycle.mongo-schemas';
import {
  OrganizationManager,
  OrganizationManagerSchema,
} from '../../organizations/mongo/organization.mongo-schemas';
import { Profile, ProfileSchema } from '../../profile/mongo/profile.mongo-schemas';
import { User, UserSchema } from '../../users/schemas/user.schema';
import {
  StudyCollection,
  StudyCollectionSchema,
} from './study-collection.mongo-schema';
import { MongoStudyCollectionStore } from './mongo-study-collection.store';

/**
 * Explicit opt-in only. Never run against a shared or production database:
 * this suite creates and drops its own uniquely named scratch database.
 *
 * Example (with an existing local replica set):
 * STUDY_COLLECTIONS_TEST_MONGO_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0 \
 *   pnpm --filter @losapuntes/api test -- --runInBand \
 *   study-collection-lifecycle.mongo-int.spec.ts
 */
const uri = process.env.STUDY_COLLECTIONS_TEST_MONGO_URI;
const runMongo = uri ? describe : describe.skip;
const localHosts = new Set(['localhost', '127.0.0.1', 'mongo']);
const uniqueDbName = `losapuntes_b50_${randomUUID().replace(/-/gu, '')}`;

type Models = {
  users: Model<User>;
  collections: Model<StudyCollection>;
  profiles: Model<Profile>;
  managers: Model<OrganizationManager>;
  jobs: Model<AccountOffboardingJob>;
  audits: Model<SecurityAudit>;
};

runMongo('B50 real Mongo replica-set acceptance: collections vs closure', () => {
  let connection: Connection;
  let models: Models;
  let collections: MongoStudyCollectionStore;
  let lifecycle: MongoAccountLifecycleStore;
  let verifiedLocalReplica = false;

  beforeAll(async () => {
    if (!uri) throw new Error('Local test Mongo URI is required');
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new Error('Local test Mongo URI is malformed');
    }
    if (
      !['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      !localHosts.has(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      !parsed.searchParams.get('replicaSet')
    ) {
      throw new Error(
        'B50 Mongo acceptance requires an uncredentialed local replica-set URI',
      );
    }
    connection = await createConnection(uri, {
      dbName: uniqueDbName,
      serverSelectionTimeoutMS: 8_000,
    }).asPromise();
    const hello = await connection.db!.admin().command({ hello: 1 });
    const reportedMembers: unknown[] = [
      ...(Array.isArray(hello.hosts) ? hello.hosts : []),
      ...(Array.isArray(hello.passives) ? hello.passives : []),
      ...(Array.isArray(hello.arbiters) ? hello.arbiters : []),
      hello.me,
    ].filter((value) => value !== undefined);
    const membersLocal = reportedMembers.length > 0 &&
      reportedMembers.every((entry) => {
        if (typeof entry !== 'string') return false;
        const [host, port, extra] = entry.split(':');
        return !extra && localHosts.has(host ?? '') &&
          (port === undefined || /^[0-9]{1,5}$/u.test(port));
      });
    if (
      typeof hello.setName !== 'string' ||
      hello.isWritablePrimary !== true ||
      !membersLocal
    ) {
      throw new Error('B52 requires an initialized exclusively local replica set');
    }
    // Mark this connection safe to clean up only after verifying all
    // advertised replica members; a failed safety check must NEVER drop DBs.
    verifiedLocalReplica = true;
    models = {
      users: connection.model(User.name, UserSchema),
      collections: connection.model(StudyCollection.name, StudyCollectionSchema),
      profiles: connection.model(Profile.name, ProfileSchema),
      managers: connection.model(OrganizationManager.name, OrganizationManagerSchema),
      jobs: connection.model(AccountOffboardingJob.name, AccountOffboardingJobSchema),
      audits: connection.model(SecurityAudit.name, SecurityAuditSchema),
    };
    await Promise.all(Object.values(models).map((model) => model.init()));
    collections = new MongoStudyCollectionStore(
      models.collections, connection, models.users,
    );
    lifecycle = new MongoAccountLifecycleStore(
      connection,
      models.users,
      models.profiles,
      models.managers,
      models.jobs,
      models.audits,
      models.collections,
    );
  }, 30_000);

  afterAll(async () => {
    if (verifiedLocalReplica && connection?.readyState === 1) {
      // The name is generated above, never taken from the environment.
      await connection.dropDatabase();
    }
    await connection?.close();
  }, 30_000);

  async function owner() {
    const user = await models.users.create({
      email: `b50-${randomUUID()}@example.invalid`,
      role: 'user',
      account_status: 'active',
      credential_version: 1,
    });
    return user.id;
  }

  async function create(ownerUserId: string, operationKey = randomUUID()) {
    return collections.create({
      id: randomUUID(),
      ownerUserId,
      operationKey,
      title: 'Repaso de Algebra',
      description: 'Temas para el parcial',
    });
  }

  async function close(ownerUserId: string) {
    return lifecycle.closeAccount({
      userId: ownerUserId,
      expectedCredentialVersion: 1,
      now: new Date(),
      auditId: randomUUID(),
      cleanupJobId: randomUUID(),
    });
  }

  it('commits all five mutation paths before closure and deletes owner data at closure', async () => {
    const userId = await owner();
    const first = await create(userId);
    const duplicate = await collections.create({
      id: randomUUID(), ownerUserId: userId,
      operationKey: first.operationKey,
      title: first.title, description: first.description,
    });
    expect(duplicate.id).toBe(first.id);

    const updated = await collections.updateOwned({
      id: first.id, ownerUserId: userId, expectedRevision: first.revision,
      patch: { title: 'Repaso actualizado' },
    });
    expect(updated?.title).toBe('Repaso actualizado');

    const resourceId = randomUUID();
    const added = await collections.addResource(first.id, userId, resourceId);
    expect(added?.resourceIds).toContain(resourceId);
    const removed = await collections.removeResource(first.id, userId, resourceId);
    expect(removed?.resourceIds).not.toContain(resourceId);

    const second = await create(userId);
    await expect(collections.deleteOwned(second.id, userId))
      .resolves.toBe(true);

    await expect(close(userId)).resolves.toMatchObject({ status: 'closed' });
    expect(await models.collections.countDocuments({
      ownerUserId: userId,
    })).toBe(0);
    const saved = await models.users.findById(userId);
    expect(saved?.account_status).toBe('closed');
  }, 30_000);

  it('refuses every mutation when account closure wins first', async () => {
    const userId = await owner();
    const existing = await create(userId);
    await expect(close(userId)).resolves.toMatchObject({ status: 'closed' });

    const actions = [
      () => create(userId),
      () => collections.updateOwned({
        id: existing.id, ownerUserId: userId,
        expectedRevision: existing.revision,
        patch: { title: 'Should not write' },
      }),
      () => collections.addResource(existing.id, userId, randomUUID()),
      () => collections.removeResource(existing.id, userId, randomUUID()),
      () => collections.deleteOwned(existing.id, userId),
    ];
    for (const attempt of actions) {
      await expect(attempt()).rejects.toMatchObject({
        response: { code: 'STUDY_COLLECTION_ACCOUNT_INACTIVE' },
      });
    }
    expect(await models.collections.countDocuments({
      ownerUserId: userId,
    })).toBe(0);
  }, 30_000);

  it('deletes only the closing owner and preserves another account\'s collections', async () => {
    const ownerA = await owner();
    const ownerB = await owner();
    await create(ownerA);
    const savedB = await create(ownerB);
    await expect(close(ownerA)).resolves.toMatchObject({ status: 'closed' });
    expect(await models.collections.countDocuments({
      ownerUserId: ownerA,
    })).toBe(0);
    expect(await models.collections.findOne({
      ownerUserId: ownerB, id: savedB.id,
    })).not.toBeNull();
    const updatedB = await collections.updateOwned({
      id: savedB.id, ownerUserId: ownerB,
      expectedRevision: savedB.revision,
      patch: { title: 'Segunda cuenta sigue activa' },
    });
    expect(updatedB?.title).toBe('Segunda cuenta sigue activa');
  }, 30_000);

  it('never resurrects a collection when creation and closure start together', async () => {
    const userId = await owner();
    const [createResult, closeResult] = await Promise.allSettled([
      create(userId),
      close(userId),
    ]);
    const closed = await models.users.findById(userId);
    const documents = await models.collections.countDocuments({
      ownerUserId: userId,
    });
    if (closed?.account_status === 'closed') {
      expect(documents).toBe(0);
    }
    if (createResult.status === 'fulfilled' && closeResult.status === 'fulfilled') {
      expect(closeResult.value.status).toBe('closed');
      expect(documents).toBe(0);
    }
    // An unresolved write conflict is NOT hidden. Inspect results if neither
    // transaction closed the user; that is a legitimate integration failure.
    expect(
      closed?.account_status === 'closed' ||
      (createResult.status === 'fulfilled' &&
        closeResult.status === 'rejected'),
    ).toBe(true);
  }, 30_000);

  /**
   * Simulate each remaining private write racing with account closure.
   * Mongo may abort one transaction with a transient write conflict. The
   * invariant is stronger: after a confirmed closure, owner data is gone.
   * A failed closure is never silently reported as an accepted close.
   */
  const competingMutations = [
    {
      label: 'edit',
      perform: (userId: string, row: Awaited<ReturnType<typeof create>>) =>
        collections.updateOwned({
          id: row.id,
          ownerUserId: userId,
          expectedRevision: row.revision,
          patch: { title: 'Concurrent revision' },
        }),
    },
    {
      label: 'add resource',
      perform: (userId: string, row: Awaited<ReturnType<typeof create>>) =>
        collections.addResource(row.id, userId, randomUUID()),
    },
    {
      label: 'remove resource',
      perform: (userId: string, row: Awaited<ReturnType<typeof create>>) =>
        collections.removeResource(row.id, userId, row.resourceIds[0]!),
    },
    {
      label: 'delete',
      perform: (userId: string, row: Awaited<ReturnType<typeof create>>) =>
        collections.deleteOwned(row.id, userId),
    },
  ];

  it.each(competingMutations)(
    'never leaves owner documents after $label races a successful closure',
    async ({ label, perform }) => {
      const userId = await owner();
      const saved = await create(userId);
      // A valid pre-existing reference is needed for removal; the mutation
      // itself is performed under the same owner-revision transaction.
      const reference = randomUUID();
      await collections.addResource(saved.id, userId, reference);
      const fresh = await models.collections.findOne({
        id: saved.id, ownerUserId: userId,
      });
      expect(fresh).not.toBeNull();
      const revision = fresh!.revision;
      const row = {
        ...saved,
        revision,
        resourceIds: [reference],
      };
      const [mutation, closure] = await Promise.allSettled([
        perform(userId, row),
        close(userId),
      ]);
      // A write conflict may reject one concurrent closure; after both
      // operations settle, retry that closure and REQUIRE a real commit.
      // The suite must not pass merely because a transaction was rejected.
      if (closure.status === 'rejected') {
        expect(closure.reason).toBeTruthy();
      }
      const completed = closure.status === 'fulfilled' &&
        closure.value.status === 'closed'
        ? closure.value
        : await close(userId);
      expect(completed.status).toBe('closed');

      const user = await models.users.findById(userId);
      const remaining = await models.collections.countDocuments({
        ownerUserId: userId,
      });
      expect(user?.account_status).toBe('closed');
      expect(remaining).toBe(0);
      if (mutation.status === 'rejected') {
        expect(mutation.reason).toBeTruthy();
      }
      expect(label.length).toBeGreaterThan(0);
    },
    30_000,
  );

  it('keeps the same idempotency key and original collection on replay', async () => {
    const userId = await owner();
    const operationKey = randomUUID();
    const first = await create(userId, operationKey);
    const second = await create(userId, operationKey);
    expect(second.id).toBe(first.id);
    expect(second.revision).toBe(first.revision);
    expect(await models.collections.countDocuments({
      ownerUserId: userId, operationKey,
    })).toBe(1);
  }, 30_000);

  it('rolls back both closure and collection deletion when audit persistence fails', async () => {
    const userId = await owner();
    const first = await create(userId);
    const faulted = new MongoAccountLifecycleStore(
      connection, models.users, models.profiles, models.managers,
      models.jobs,
      { create: async () => { throw new Error('audit unavailable'); } } as never,
      models.collections,
    );
    await expect(faulted.closeAccount({
      userId,
      expectedCredentialVersion: 1,
      now: new Date(),
      auditId: randomUUID(),
      cleanupJobId: randomUUID(),
    })).rejects.toThrow('audit unavailable');
    expect((await models.users.findById(userId))?.account_status).toBe('active');
    expect(await models.collections.exists({
      id: first.id, ownerUserId: userId,
    })).not.toBeNull();
  }, 30_000);
});
