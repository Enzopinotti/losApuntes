import { randomUUID } from 'node:crypto';

import { AccountExportService } from '../../data-lifecycle/domain/account-export.service';
import { StudyCollectionService } from '../domain/study-collection.service';
import {
  ConnectionStates,
  createConnection,
  type Connection,
  type Model,
} from 'mongoose';

import { MongoAccountLifecycleStore } from '../../data-lifecycle/mongo/mongo-account-lifecycle.store';
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
import {
  Profile,
  ProfileSchema,
} from '../../profile/mongo/profile.mongo-schemas';
import { User, UserSchema } from '../../users/schemas/user.schema';
import {
  StudyCollection,
  StudyCollectionSchema,
} from './study-collection.mongo-schema';
import { MongoStudyCollectionStore } from './mongo-study-collection.store';
import {
  StudyProgress,
  StudyProgressSchema,
} from '../../study-progress/mongo/study-progress.schema';
import { StudyCollectionExportReader } from './study-collection-export.reader';
import { StudyProgressExportReader } from '../../study-progress/mongo/study-progress-export.reader';

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
const uniqueDbName = `losapuntes_b50_${randomUUID().replace(/-/gu, '')}`;

type Models = {
  users: Model<User>;
  collections: Model<StudyCollection>;
  progress: Model<StudyProgress>;
  profiles: Model<Profile>;
  managers: Model<OrganizationManager>;
  jobs: Model<AccountOffboardingJob>;
  audits: Model<SecurityAudit>;
};

runMongo(
  'B50 real Mongo replica-set acceptance: collections vs closure',
  () => {
    let connection: Connection;
    let models: Models;
    let collections: MongoStudyCollectionStore;
    let lifecycle: MongoAccountLifecycleStore;
    let exportReader: StudyCollectionExportReader;
    let verifiedLocalReplica = false;

    beforeAll(async () => {
      if (!uri) throw new Error('Local test Mongo URI is required');
      let parsed: URL;
      try {
        parsed = new URL(uri);
      } catch {
        throw new Error('Local test Mongo URI is malformed');
      }
      const optionEntries = [...parsed.searchParams.entries()];
      const optionKeys = new Set(optionEntries.map(([key]) => key));
      const validReplicaOptions =
        optionEntries.length >= 1 &&
        optionEntries.length <= 2 &&
        optionKeys.size === optionEntries.length &&
        optionKeys.has('replicaSet') &&
        optionEntries.every(
          ([key, value]) =>
            (key === 'replicaSet' && value === 'rs0') ||
            (key === 'directConnection' && value === 'true'),
        );
      if (
        parsed.protocol !== 'mongodb:' ||
        parsed.hostname !== '127.0.0.1' ||
        parsed.port !== '27017' ||
        parsed.pathname !== '/' ||
        parsed.username ||
        parsed.password ||
        parsed.hash !== '' ||
        !validReplicaOptions
      ) {
        throw new Error(
          'B50 Mongo acceptance requires an uncredentialed local replica-set URI',
        );
      }
      connection = await createConnection(uri, {
        directConnection: true,
        dbName: uniqueDbName,
        serverSelectionTimeoutMS: 8_000,
      }).asPromise();
      // Do not trust Mongo's loosely typed admin() response, even in tests:
      // safety must be proved before we mark a scratch database disposable.
      const response: unknown = await connection
        .db!.admin()
        .command({ hello: 1 });
      if (!response || typeof response !== 'object') {
        throw new Error('B50 refuses an invalid Mongo hello response');
      }
      const hello = response as Record<string, unknown>;
      const membersOf = (value: unknown): unknown[] =>
        Array.isArray(value) ? (value as unknown[]) : [];
      const localHosts = new Set(['127.0.0.1']);
      const reportedMembers: unknown[] = [
        ...membersOf(hello.hosts),
        ...membersOf(hello.passives),
        ...membersOf(hello.arbiters),
        hello.me,
      ].filter((value) => value !== undefined);
      const membersLocal =
        reportedMembers.length > 0 &&
        reportedMembers.every((entry) => {
          if (typeof entry !== 'string') return false;
          const [host, port, extra] = entry.split(':');
          return (
            !extra &&
            localHosts.has(host ?? '') &&
            (port === undefined || /^[0-9]{1,5}$/u.test(port))
          );
        });
      if (
        typeof hello.setName !== 'string' ||
        hello.isWritablePrimary !== true ||
        !membersLocal
      ) {
        throw new Error(
          'B52 requires an initialized exclusively local replica set',
        );
      }
      // Mark this connection safe to clean up only after verifying all
      // advertised replica members; a failed safety check must NEVER drop DBs.
      verifiedLocalReplica = true;
      models = {
        users: connection.model(User.name, UserSchema),
        collections: connection.model(
          StudyCollection.name,
          StudyCollectionSchema,
        ),
        progress: connection.model(StudyProgress.name, StudyProgressSchema),
        profiles: connection.model(Profile.name, ProfileSchema),
        managers: connection.model(
          OrganizationManager.name,
          OrganizationManagerSchema,
        ),
        jobs: connection.model(
          AccountOffboardingJob.name,
          AccountOffboardingJobSchema,
        ),
        audits: connection.model(SecurityAudit.name, SecurityAuditSchema),
      };
      await Promise.all(Object.values(models).map((model) => model.init()));
      collections = new MongoStudyCollectionStore(
        models.collections,
        connection,
        models.users,
      );
      exportReader = new StudyCollectionExportReader(models.collections);
      lifecycle = new MongoAccountLifecycleStore(
        connection,
        models.users,
        models.profiles,
        models.managers,
        models.jobs,
        models.audits,
        models.collections,
        models.progress,
      );
    }, 30_000);

    afterAll(async () => {
      if (
        verifiedLocalReplica &&
        connection?.readyState === ConnectionStates.connected
      ) {
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
      const id: unknown = user.id;
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error('Mongo user did not provide a valid owner ID');
      }
      return id;
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

    /**
     * After a deliberately concurrent write, the first close may lose a
     * Mongo transaction conflict. Retry it only after both racers have
     * settled and REQUIRE a committed closure before checking for leftovers.
     * Bounded retries prevent accepting a permanent database failure.
     */
    async function committedClosureAfterRace(
      userId: string,
      initial: PromiseSettledResult<Awaited<ReturnType<typeof close>>>,
    ) {
      if (initial.status === 'fulfilled' && initial.value.status === 'closed') {
        return initial.value;
      }
      let lastError: unknown =
        initial.status === 'rejected'
          ? initial.reason
          : new Error('Account closure was not committed');
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const outcome = await close(userId);
          if (outcome.status === 'closed') return outcome;
          lastError = new Error(`Account closure status: ${outcome.status}`);
        } catch (error) {
          lastError = error;
        }
      }
      throw new Error('Concurrent account closure never committed', {
        cause: lastError,
      });
    }

    it('commits all five mutation paths before closure and deletes owner data at closure', async () => {
      const userId = await owner();
      const first = await create(userId);
      const duplicate = await collections.create({
        id: randomUUID(),
        ownerUserId: userId,
        operationKey: first.operationKey,
        title: first.title,
        description: first.description,
      });
      expect(duplicate.id).toBe(first.id);

      const updated = await collections.updateOwned({
        id: first.id,
        ownerUserId: userId,
        expectedRevision: first.revision,
        patch: { title: 'Repaso actualizado' },
      });
      expect(updated?.title).toBe('Repaso actualizado');

      const resourceId = randomUUID();
      const added = await collections.addResource(first.id, userId, resourceId);
      expect(added?.resourceIds).toContain(resourceId);
      // A stale conditional deletion cannot remove the reference or advance
      // the revision; this uses the real Mongo store on the replica set.
      await expect(
        collections.removeResource(
          first.id,
          userId,
          resourceId,
          (added?.revision ?? 2) - 1,
        ),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_COLLECTION_REVISION_CONFLICT' },
      });
      const unchanged = await models.collections.findOne({
        id: first.id,
        ownerUserId: userId,
      });
      expect(unchanged?.resourceIds).toContain(resourceId);
      expect(unchanged?.revision).toBe(added?.revision);
      const removed = await collections.removeResource(
        first.id,
        userId,
        resourceId,
        added!.revision,
      );
      expect(removed?.resourceIds).not.toContain(resourceId);
      expect(removed?.revision).toBe(added!.revision + 1);

      const second = await create(userId);
      await expect(collections.deleteOwned(second.id, userId)).resolves.toBe(
        true,
      );

      await expect(close(userId)).resolves.toMatchObject({ status: 'closed' });
      expect(
        await models.collections.countDocuments({
          ownerUserId: userId,
        }),
      ).toBe(0);
      const saved = await models.users.findById(userId);
      expect(saved?.account_status).toBe('closed');
    }, 30_000);

    it('refuses every mutation when account closure wins first', async () => {
      const userId = await owner();
      const existing = await create(userId);
      await expect(close(userId)).resolves.toMatchObject({ status: 'closed' });

      const actions = [
        () => create(userId),
        () =>
          collections.updateOwned({
            id: existing.id,
            ownerUserId: userId,
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
      expect(
        await models.collections.countDocuments({
          ownerUserId: userId,
        }),
      ).toBe(0);
    }, 30_000);

    it("deletes only the closing owner and preserves another account's collections", async () => {
      const ownerA = await owner();
      const ownerB = await owner();
      await create(ownerA);
      const savedB = await create(ownerB);
      await expect(close(ownerA)).resolves.toMatchObject({ status: 'closed' });
      expect(
        await models.collections.countDocuments({
          ownerUserId: ownerA,
        }),
      ).toBe(0);
      expect(
        await models.collections.findOne({
          ownerUserId: ownerB,
          id: savedB.id,
        }),
      ).not.toBeNull();
      const updatedB = await collections.updateOwned({
        id: savedB.id,
        ownerUserId: ownerB,
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
      // Unlike the old test, an aborted initial close is NOT accepted as
      // success just because the other racer created a collection.
      const committed = await committedClosureAfterRace(userId, closeResult);
      expect(committed.status).toBe('closed');
      const account = await models.users.findById(userId);
      const documents = await models.collections.countDocuments({
        ownerUserId: userId,
      });
      expect(account?.account_status).toBe('closed');
      expect(documents).toBe(0);
      if (createResult.status === 'rejected') {
        expect(createResult.reason).toBeTruthy();
      }
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
          collections.removeResource(row.id, userId, row.resourceIds[0]),
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
          id: saved.id,
          ownerUserId: userId,
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
        const committed = await committedClosureAfterRace(userId, closure);
        expect(committed.status).toBe('closed');

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
      expect(
        await models.collections.countDocuments({
          ownerUserId: userId,
          operationKey,
        }),
      ).toBe(1);
    }, 30_000);

    it('exports only the owner collections with bounded stable pages and no internal fields', async () => {
      const alice = await owner();
      const bob = await owner();
      const a = await create(alice);
      const b = await create(alice);
      const foreign = await create(bob);

      await expect(exportReader.hasOwnedCollections(alice)).resolves.toBe(true);
      await expect(exportReader.hasOwnedCollections(bob)).resolves.toBe(true);
      const first = await exportReader.listAccountExportCollections(alice, {
        limit: 1,
        cursor: null,
      });
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = await exportReader.listAccountExportCollections(alice, {
        limit: 1,
        cursor: first.nextCursor,
      });
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      const ids = [...first.items, ...second.items].map((row) => row.id);
      expect(ids).toEqual([a.id, b.id].sort());
      expect(ids).not.toContain(foreign.id);
      const serialized = JSON.stringify([...first.items, ...second.items]);
      expect(serialized).not.toContain(alice);
      expect(serialized).not.toContain(bob);
      expect(serialized).not.toContain('operationKey');
      expect(serialized).not.toContain('_id');
      await expect(
        exportReader.listAccountExportCollections(bob, {
          limit: 10,
          cursor: first.nextCursor,
        }),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_COLLECTION_EXPORT_CURSOR_INVALID' },
      });
    }, 30_000);

    it('retains v2 account portability after rollback and erases closed-owner exports', async () => {
      const alice = await owner();
      const bob = await owner();
      const owned = await create(alice);
      const foreign = await create(bob);
      const versions: Array<{ ownerUserId: string; version: number }> = [];
      const fakeStore = {
        requestActive: (input: {
          id: string;
          userId: string;
          formatVersion: 1 | 2;
          now: Date;
        }) => {
          versions.push({
            ownerUserId: input.userId,
            version: input.formatVersion,
          });
          return Promise.resolve({
            created: true,
            job: {
              id: input.id,
              userId: input.userId,
              formatVersion: input.formatVersion,
              state: 'pending',
              createdAt: input.now,
              failureCode: null,
              artifactExpiresAt: null,
              artifactGeneration: null,
            },
          });
        },
      };
      const request = new AccountExportService(
        fakeStore as never,
        { hasActiveAccount: () => Promise.resolve(true) } as never,
        { get: () => false } as never,
        exportReader,
        new StudyProgressExportReader(models.progress),
      );

      const before = await request.request(alice);
      expect(before.export.formatVersion).toBe(2);
      expect(versions).toContainEqual({ ownerUserId: alice, version: 2 });
      await expect(close(alice)).resolves.toMatchObject({ status: 'closed' });
      await expect(exportReader.hasOwnedCollections(alice)).resolves.toBe(
        false,
      );
      const after = await exportReader.listAccountExportCollections(alice, {
        limit: 10,
        cursor: null,
      });
      expect(after.items).toEqual([]);

      const bobExport = await exportReader.listAccountExportCollections(bob, {
        limit: 10,
        cursor: null,
      });
      expect(bobExport.items.map((row) => row.id)).toEqual([foreign.id]);
      expect(bobExport.items.map((row) => row.id)).not.toContain(owned.id);
      const otherAccount = await request.request(bob);
      expect(otherAccount.export.formatVersion).toBe(2);
      expect(versions).toContainEqual({ ownerUserId: bob, version: 2 });
    }, 30_000);

    it('returns stale revision conflict after concurrent removal shrinks a resource page', async () => {
      const userId = await owner();
      const saved = await create(userId);
      const firstId = randomUUID();
      const secondId = randomUUID();
      await collections.addResource(saved.id, userId, firstId);
      await collections.addResource(saved.id, userId, secondId);

      const service = new StudyCollectionService(collections, {
        get: (resourceId: string) =>
          Promise.resolve({
            resource: { id: resourceId, title: 'Test resource' },
          }),
      } as never);
      const firstPage = await service.listResources(userId, saved.id, 1);
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.nextCursor).toEqual(expect.any(String));

      // A different client removes the resource that occupied the cursor
      // position: its index no longer exists in the current revision.
      await collections.removeResource(saved.id, userId, secondId);
      await expect(
        service.listResources(
          userId,
          saved.id,
          1,
          firstPage.nextCursor ?? undefined,
        ),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_COLLECTION_CURSOR_STALE' },
      });
    }, 30_000);

    it('rolls back both closure and collection deletion when audit persistence fails', async () => {
      const userId = await owner();
      const first = await create(userId);
      const faulted = new MongoAccountLifecycleStore(
        connection,
        models.users,
        models.profiles,
        models.managers,
        models.jobs,
        {
          create: () => Promise.reject(new Error('audit unavailable')),
        } as never,
        models.collections,
        models.progress,
      );
      await expect(
        faulted.closeAccount({
          userId,
          expectedCredentialVersion: 1,
          now: new Date(),
          auditId: randomUUID(),
          cleanupJobId: randomUUID(),
        }),
      ).rejects.toThrow('audit unavailable');
      expect((await models.users.findById(userId))?.account_status).toBe(
        'active',
      );
      expect(
        await models.collections.exists({
          id: first.id,
          ownerUserId: userId,
        }),
      ).not.toBeNull();
    }, 30_000);
  },
);
