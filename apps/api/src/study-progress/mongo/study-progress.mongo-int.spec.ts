import { createHash, randomUUID } from 'node:crypto';
import {
  createConnection,
  ConnectionStates,
  type Connection,
  type Model,
} from 'mongoose';

import { MongoAccountLifecycleStore } from '../../data-lifecycle/mongo/mongo-account-lifecycle.store';
import { MongoAccountExportStore } from '../../data-lifecycle/mongo/mongo-account-export.store';
import { MongoAccountExportOrphanCleanupStore } from '../../data-lifecycle/mongo/mongo-account-export-orphan-cleanup.store';
import {
  AccountExportOrphanCleanup,
  AccountExportOrphanCleanupSchema,
} from '../../data-lifecycle/mongo/account-export-orphan-cleanup.schema';
import {
  AccountExportJob,
  AccountExportJobSchema,
} from '../../data-lifecycle/mongo/account-export.mongo-schema';
import {
  AccountExportAssembler,
  type AccountExportArtifactSink,
} from '../../data-lifecycle/domain/account-export-assembler';
import { AccountExportService } from '../../data-lifecycle/domain/account-export.service';
import { AccountExportProcessor } from '../../data-lifecycle/domain/account-export-processor';
import { S3AccountExportArtifactStorage } from '../../data-lifecycle/storage/account-export-artifact-storage';
import { createS3ObjectStorage } from '../../files/storage/s3-object-storage';
import type { AccountExportArtifactStorage } from '../../data-lifecycle/storage/account-export-artifact-storage';
import type { AccountExportOrphanCleanupStore } from '../../data-lifecycle/domain/account-export-orphan-cleanup.store';
import { ACCOUNT_EXPORT_LEASE_DURATION_MS } from '../../data-lifecycle/domain/account-export.types';
import type { AccountExportJobRecord } from '../../data-lifecycle/domain/account-export.types';
import {
  AccountExportContributorRegistry,
  ACCOUNT_EXPORT_V3_SECTION_IDS,
} from '../../data-lifecycle/domain/account-export-contributor.registry';
import type { AccountExportContributor } from '../../data-lifecycle/domain/account-export.types';
import { StudyProgressExportContributor } from '../../data-lifecycle/contributors/account-export-study-progress.contributor';
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
import {
  StudyCollection,
  StudyCollectionSchema,
} from '../../study-collections/mongo/study-collection.mongo-schema';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { UsersService } from '../../users/users.service';
import { StudyProgressService } from '../study-progress.service';
import { StudyProgress, StudyProgressSchema } from './study-progress.schema';
import { StudyProgressExportReader } from './study-progress-export.reader';

const uri = process.env.STUDY_PROGRESS_TEST_MONGO_URI;
const runMongo = uri ? describe : describe.skip;
const expectedDate: unknown = expect.any(Date);
const safeHosts = new Set(['127.0.0.1']);
const database = 'losapuntes_b61_' + randomUUID().replace(/-/gu, '');
const planFor = (subjectId: string) => ({
  format: 'losapuntes.study-session',
  version: 1,
  subjectId,
  title: 'Mi plan privado',
  notes: '',
  startsAt: null,
  tasks: [{ kind: 'question', id: randomUUID(), minutes: 20, done: false }],
});

runMongo(
  'B61 private progress acceptance on isolated Mongo replica set',
  () => {
    let connection: Connection;
    let progress: Model<StudyProgress>;
    let users: Model<User>;
    let service: StudyProgressService;
    let exportReader: StudyProgressExportReader;
    let lifecycle: MongoAccountLifecycleStore;
    let exportJobs: Model<AccountExportJob>;
    let orphanJobs: Model<AccountExportOrphanCleanup>;
    let verifiedReplica = false;

    beforeAll(async () => {
      if (!uri) throw new Error('Explicit opt-in URI required');
      const parsed = new URL(uri);
      if (
        parsed.protocol !== 'mongodb:' ||
        parsed.hostname !== '127.0.0.1' ||
        parsed.port !== '27017' ||
        parsed.pathname !== '/' ||
        parsed.username ||
        parsed.password ||
        parsed.hash !== '' ||
        parsed.searchParams.size !== 1 ||
        parsed.searchParams.get('replicaSet') !== 'rs0'
      ) {
        throw new Error(
          'B61 accepts only a local uncredentialed Mongo replica set',
        );
      }
      connection = await createConnection(uri, {
        dbName: database,
        serverSelectionTimeoutMS: 8_000,
      }).asPromise();
      const response: unknown = await connection.db!.admin().command({
        hello: 1,
      });
      if (!response || typeof response !== 'object') {
        throw new Error('B61 refuses an invalid Mongo topology response');
      }
      const hello = response as Record<string, unknown>;
      const memberList = (value: unknown): unknown[] =>
        Array.isArray(value) ? (value as unknown[]) : [];
      const members: unknown[] = [
        ...memberList(hello.hosts),
        ...memberList(hello.passives),
        ...memberList(hello.arbiters),
        hello.me,
      ].filter((item) => item !== undefined);
      if (
        hello.isWritablePrimary !== true ||
        typeof hello.setName !== 'string' ||
        members.length === 0 ||
        !members.every((member) => {
          if (typeof member !== 'string') return false;
          const [host, port, extra] = member.split(':');
          return (
            !!host &&
            safeHosts.has(host) &&
            !extra &&
            (port === undefined || /^\d{1,5}$/u.test(port))
          );
        })
      ) {
        throw new Error('B61 refuses unverified or nonlocal Mongo topology');
      }
      verifiedReplica = true;
      users = connection.model(User.name, UserSchema);
      progress = connection.model(StudyProgress.name, StudyProgressSchema);
      const profiles = connection.model(Profile.name, ProfileSchema);
      const managers = connection.model(
        OrganizationManager.name,
        OrganizationManagerSchema,
      );
      const jobs = connection.model(
        AccountOffboardingJob.name,
        AccountOffboardingJobSchema,
      );
      const audits = connection.model(SecurityAudit.name, SecurityAuditSchema);
      const collections = connection.model(
        StudyCollection.name,
        StudyCollectionSchema,
      );
      exportJobs = connection.model(
        AccountExportJob.name,
        AccountExportJobSchema,
      );
      orphanJobs = connection.model(
        AccountExportOrphanCleanup.name,
        AccountExportOrphanCleanupSchema,
      );
      await Promise.all(
        [
          users,
          progress,
          profiles,
          managers,
          jobs,
          audits,
          collections,
          exportJobs,
          orphanJobs,
        ].map((model) => model.init()),
      );
      service = new StudyProgressService(progress, users, connection);
      exportReader = new StudyProgressExportReader(progress);
      lifecycle = new MongoAccountLifecycleStore(
        connection,
        users,
        profiles,
        managers,
        jobs,
        audits,
        collections,
        progress,
      );
    }, 30_000);

    afterAll(async () => {
      if (verifiedReplica && connection?.readyState === ConnectionStates.connected) {
        await connection.dropDatabase();
      }
      await connection?.close();
    }, 30_000);

    async function owner() {
      const row = await users.create({
        email: randomUUID() + '@example.invalid',
        role: 'user',
        account_status: 'active',
        credential_version: 1,
      });
      const id: unknown = row.id;
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error('B61 owner fixture requires a nonempty string user ID');
      }
      return id;
    }

    it('isolates owners and requires explicit revision to overwrite', async () => {
      const first = await owner();
      const second = await owner();
      const subject = randomUUID();
      const original = planFor(subject);
      await expect(service.get(first, subject)).rejects.toMatchObject({
        response: { code: 'STUDY_PROGRESS_NOT_FOUND' },
      });
      const initial = await service.save(first, subject, 0, original);
      expect(initial.progress.revision).toBe(1);
      await expect(service.get(second, subject)).rejects.toMatchObject({
        response: { code: 'STUDY_PROGRESS_NOT_FOUND' },
      });
      await expect(
        service.save(first, subject, 0, original),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_PROGRESS_REVISION_CONFLICT' },
      });
      await expect(
        service.save(second, subject, 0, planFor(subject)),
      ).resolves.toMatchObject({ progress: { revision: 1 } });
      const next = await service.save(first, subject, 1, {
        ...original,
        title: 'Repaso actualizado',
      });
      expect(next.progress.revision).toBe(2);
      await expect(
        service.save(first, subject, 1, original),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_PROGRESS_REVISION_CONFLICT' },
      });
      expect((await service.get(first, subject)).progress.plan).toMatchObject({
        title: 'Repaso actualizado',
      });
      await expect(service.remove(first, subject, 1)).rejects.toMatchObject({
        response: { code: 'STUDY_PROGRESS_REVISION_CONFLICT' },
      });
      await expect(service.remove(first, subject, 2)).resolves.toEqual({
        deleted: true,
      });
      await expect(service.get(first, subject)).rejects.toMatchObject({
        response: { code: 'STUDY_PROGRESS_NOT_FOUND' },
      });
      // Other owner's saved plan was not touched.
      expect((await service.get(second, subject)).progress.revision).toBe(1);
    }, 30_000);

    it('caps owner storage at sixteen distinct subjects', async () => {
      const userId = await owner();
      const subjects = Array.from({ length: 16 }, () => randomUUID());
      for (const subject of subjects) {
        await service.save(userId, subject, 0, planFor(subject));
      }
      const extra = randomUUID();
      await expect(
        service.save(userId, extra, 0, planFor(extra)),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_PROGRESS_LIMIT_REACHED' },
      });
      // Existing subjects still report stale revision, rather than the quota.
      await expect(
        service.save(userId, subjects[0], 0, planFor(subjects[0])),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_PROGRESS_REVISION_CONFLICT' },
      });
      await service.remove(userId, subjects[0], 1);
      await expect(
        service.save(userId, extra, 0, planFor(extra)),
      ).resolves.toMatchObject({ progress: { revision: 1 } });
    }, 60_000);

    it('exports only the owner projection before closure and no rows after closure', async () => {
      const ownerId = await owner();
      const secondOwner = await owner();
      const subjectId = randomUUID();
      const secondSubject = randomUUID();
      await service.save(ownerId, subjectId, 0, planFor(subjectId));
      await service.save(secondOwner, secondSubject, 0, planFor(secondSubject));
      expect(await exportReader.hasOwnedProgress(ownerId)).toBe(true);
      const rows = await exportReader.listAccountExportProgress(ownerId, {
        cursor: null,
        limit: 100,
      });
      expect(rows.items).toHaveLength(1);
      expect(rows.items[0]?.subjectId).toBe(subjectId);
      expect(rows.items[0]?.plan.subjectId).toBe(subjectId);
      expect(rows.nextCursor).toBeNull();
      expect(Object.keys(rows.items[0] ?? {}).sort()).toEqual([
        'createdAt',
        'plan',
        'revision',
        'subjectId',
        'updatedAt',
      ]);
      const result = await lifecycle.closeAccount({
        userId: ownerId,
        expectedCredentialVersion: 1,
        now: new Date(),
        cleanupJobId: randomUUID(),
        auditId: randomUUID(),
      });
      expect(result.status).toBe('closed');
      expect(await exportReader.hasOwnedProgress(ownerId)).toBe(false);
      expect(
        (
          await exportReader.listAccountExportProgress(ownerId, {
            cursor: null,
            limit: 100,
          })
        ).items,
      ).toHaveLength(0);
      expect(await exportReader.hasOwnedProgress(secondOwner)).toBe(true);
    }, 30_000);

    it('B63 assembles an owner-only v3 JSON from real Mongo records', async () => {
      const userId = await owner();
      const foreignId = await owner();
      const subjectId = randomUUID();
      const otherSubject = randomUUID();
      await service.save(userId, subjectId, 0, planFor(subjectId));
      await service.save(foreignId, otherSubject, 0, planFor(otherSubject));

      const live = new StudyProgressExportContributor(exportReader);
      const contributors: AccountExportContributor[] =
        ACCOUNT_EXPORT_V3_SECTION_IDS.map((sectionId) =>
          sectionId === 'study.progress'
            ? live
            : {
                sectionId,
                readPage: () =>
                  Promise.resolve({
                    records: [],
                    nextCursor: null,
                  }),
              },
        );
      const chunks: string[] = [];
      const commit = jest.fn().mockResolvedValue(undefined);
      const sink: AccountExportArtifactSink = {
        write: (chunk) => {
          chunks.push(chunk);
          return Promise.resolve();
        },
        commit,
        abort: jest.fn().mockResolvedValue(undefined),
      };
      const userReader = new UsersService(users as never);
      const exportService = {
        readContributorPage: async (
          contributor: AccountExportContributor,
          ownerUserId: string,
          cursor: string | null,
        ) => contributor.readPage({ userId: ownerUserId, cursor, limit: 100 }),
        assertActiveAccount: (ownerUserId: string) => {
          if (ownerUserId !== userId) {
            return Promise.reject(new Error('Unexpected account authority'));
          }
          return Promise.resolve();
        },
        captureStudyProgressExportEpoch: (ownerUserId: string) =>
          userReader.getStudyProgressExportEpoch(ownerUserId),
        assertStudyProgressExportEpoch: async (
          ownerUserId: string,
          expected: number,
        ) => {
          const actual =
            await userReader.getStudyProgressExportEpoch(ownerUserId);
          if (actual !== expected) {
            throw new Error('Study progress changed during account export');
          }
        },
      } as unknown as AccountExportService;
      const assembler = new AccountExportAssembler(
        new AccountExportContributorRegistry(contributors),
        exportService,
      );
      const result = await assembler.writeJsonV3(userId, sink);
      const bytes = chunks.join('');
      const artifact = JSON.parse(bytes) as {
        version: number;
        sections: Record<string, Array<Record<string, unknown>>>;
      };
      expect(artifact.version).toBe(3);
      expect(Object.keys(artifact.sections)).toEqual(
        ACCOUNT_EXPORT_V3_SECTION_IDS,
      );
      expect(artifact.sections['study.progress']).toHaveLength(1);
      expect(artifact.sections['study.progress'][0]?.subjectId).toBe(subjectId);
      expect(artifact.sections['study.progress'][0]?.revision).toBe(1);
      expect(bytes).not.toContain(otherSubject);
      expect(bytes).not.toContain(foreignId);
      expect(result.sectionCount).toBe(32);
      expect(result.recordCount).toBe(1);
      expect(result.byteLength).toBe(Buffer.byteLength(bytes, 'utf8'));
      expect(result.sha256).toBe(
        createHash('sha256').update(bytes).digest('hex'),
      );
      expect(commit).toHaveBeenCalledWith(result);
    }, 30_000);

    it('B64 rejects a real Mongo progress mutation during v3 assembly', async () => {
      const userId = await owner();
      const subjectId = randomUUID();
      await service.save(userId, subjectId, 0, planFor(subjectId));
      const account = new UsersService(users as never);
      const originalEpoch = await account.getStudyProgressExportEpoch(userId);

      const source = new StudyProgressExportContributor(exportReader);
      const contributors: AccountExportContributor[] =
        ACCOUNT_EXPORT_V3_SECTION_IDS.map((sectionId) =>
          sectionId === 'study.progress'
            ? source
            : {
                sectionId,
                readPage: () => Promise.resolve({ records: [], nextCursor: null }),
              },
        );
      let mutated = false;
      const commit = jest.fn().mockResolvedValue(undefined);
      const abort = jest.fn().mockResolvedValue(undefined);
      const sink: AccountExportArtifactSink = {
        write: async (chunk) => {
          // Mutation occurs after the v3 epoch was captured but before the
          // stream reaches its final consistency check.
          if (!mutated && chunk === '"study.progress":[') {
            mutated = true;
            await service.save(userId, subjectId, 1, {
              ...planFor(subjectId),
              title: 'Actualización concurrente',
            });
          }
        },
        commit,
        abort,
      };
      const exportApi = {
        captureStudyProgressExportEpoch: (ownerUserId: string) =>
          account.getStudyProgressExportEpoch(ownerUserId),
        assertStudyProgressExportEpoch: async (
          ownerUserId: string,
          expected: number,
        ) => {
          const actual = await account.getStudyProgressExportEpoch(ownerUserId);
          if (actual !== expected) {
            throw new Error('Study progress changed during account export');
          }
        },
        assertActiveAccount: (ownerUserId: string) =>
          ownerUserId !== userId
            ? Promise.reject(new Error('Wrong owner'))
            : Promise.resolve(),
        readContributorPage: (
          contributor: AccountExportContributor,
          ownerUserId: string,
          cursor: string | null,
        ) => contributor.readPage({ userId: ownerUserId, cursor, limit: 100 }),
      } as unknown as AccountExportService;
      const assembler = new AccountExportAssembler(
        new AccountExportContributorRegistry(contributors),
        exportApi,
      );
      await expect(assembler.writeJsonV3(userId, sink)).rejects.toThrow(
        'Study progress changed during account export',
      );
      expect(mutated).toBe(true);
      expect(await account.getStudyProgressExportEpoch(userId)).toBe(
        originalEpoch + 1,
      );
      expect(commit).not.toHaveBeenCalled();
      expect(abort).toHaveBeenCalledTimes(1);
    }, 30_000);

    it('B65 completes a real v3 export atomically with the owner epoch', async () => {
      const ownerId = await owner();
      const subjectId = randomUUID();
      await service.save(ownerId, subjectId, 0, planFor(subjectId));
      const account = new UsersService(users as never);
      const original = await account.getStudyProgressExportEpoch(ownerId);
      const id = randomUUID();
      const claimId = randomUUID();
      const startedAt = new Date();
      await exportJobs.create({
        id,
        userId: ownerId,
        state: 'processing',
        active: true,
        formatVersion: 3,
        attempts: 1,
        nextAttemptAt: startedAt,
        claimId,
        leaseExpiresAt: new Date(startedAt.getTime() + 120_000),
      });
      const store = new MongoAccountExportStore(exportJobs, users, connection);
      const result = await store.complete({
        id,
        claimId,
        ownerUserId: ownerId,
        expectedProgressEpoch: original,
        completedAt: new Date(),
        artifactGeneration: claimId,
        artifactExpiresAt: new Date(Date.now() + 86_400_000),
        result: {
          format: 'los-apuntes-account-export',
          formatVersion: 3,
          sectionCount: 32,
          recordCount: 1,
          byteLength: 128,
          sha256: 'a'.repeat(64),
        },
      });
      expect(result).toBe(true);
      const committed = await exportJobs.findOne({ id }).lean().exec();
      expect(committed?.state).toBe('completed');
      expect(committed?.artifactGeneration).toBe(claimId);
      expect(await account.getStudyProgressExportEpoch(ownerId)).toBe(
        original + 1,
      );
    }, 30_000);

    it('B65 rejects a v3 epoch made stale by another real progress save', async () => {
      const ownerId = await owner();
      const subjectId = randomUUID();
      await service.save(ownerId, subjectId, 0, planFor(subjectId));
      const account = new UsersService(users as never);
      const staleEpoch = await account.getStudyProgressExportEpoch(ownerId);
      const id = randomUUID();
      const claimId = randomUUID();
      await exportJobs.create({
        id,
        userId: ownerId,
        state: 'processing',
        active: true,
        formatVersion: 3,
        attempts: 1,
        nextAttemptAt: new Date(),
        claimId,
        leaseExpiresAt: new Date(Date.now() + 120_000),
      });
      await service.save(ownerId, subjectId, 1, {
        ...planFor(subjectId),
        title: 'Actualización concurrente',
      });
      const store = new MongoAccountExportStore(exportJobs, users, connection);
      const finish = (expectedProgressEpoch: number) =>
        store.complete({
          id,
          claimId,
          ownerUserId: ownerId,
          expectedProgressEpoch,
          completedAt: new Date(),
          artifactGeneration: claimId,
          artifactExpiresAt: new Date(Date.now() + 86_400_000),
          result: {
            format: 'los-apuntes-account-export',
            formatVersion: 3,
            sectionCount: 32,
            recordCount: 1,
            byteLength: 128,
            sha256: 'a'.repeat(64),
          },
        });
      await expect(finish(staleEpoch)).rejects.toThrow(
        'Study progress changed during account export',
      );
      expect((await exportJobs.findOne({ id }).lean().exec())?.state).toBe(
        'processing',
      );
      expect(await account.getStudyProgressExportEpoch(ownerId)).toBe(
        staleEpoch + 1,
      );
      await expect(finish(staleEpoch + 1)).resolves.toBe(true);
    }, 30_000);

    it('B65 cannot publish owner A job with owner B epoch authority', async () => {
      const ownerA = await owner();
      const ownerB = await owner();
      const reader = new UsersService(users as never);
      const epochA = await reader.getStudyProgressExportEpoch(ownerA);
      const epochB = await reader.getStudyProgressExportEpoch(ownerB);
      const id = randomUUID();
      const claimId = randomUUID();
      await exportJobs.create({
        id,
        userId: ownerA,
        state: 'processing',
        active: true,
        formatVersion: 3,
        attempts: 1,
        nextAttemptAt: new Date(),
        claimId,
        leaseExpiresAt: new Date(Date.now() + 120_000),
      });
      const store = new MongoAccountExportStore(exportJobs, users, connection);
      await expect(
        store.complete({
          id,
          claimId,
          ownerUserId: ownerB,
          expectedProgressEpoch: epochB,
          completedAt: new Date(),
          artifactGeneration: claimId,
          artifactExpiresAt: new Date(Date.now() + 86_400_000),
          result: {
            format: 'los-apuntes-account-export',
            formatVersion: 3,
            sectionCount: 32,
            recordCount: 0,
            byteLength: 128,
            sha256: 'a'.repeat(64),
          },
        }),
      ).resolves.toBe(false);
      expect((await exportJobs.findOne({ id }).lean().exec())?.state).toBe(
        'processing',
      );
      expect(await reader.getStudyProgressExportEpoch(ownerA)).toBe(epochA);
      expect(await reader.getStudyProgressExportEpoch(ownerB)).toBe(epochB);
    }, 30_000);

    it('B65 does not increment owner epoch if a v3 claim has expired', async () => {
      const ownerId = await owner();
      const account = new UsersService(users as never);
      const epoch = await account.getStudyProgressExportEpoch(ownerId);
      const id = randomUUID();
      const claimId = randomUUID();
      const expired = new Date(Date.now() - 10_000);
      await exportJobs.create({
        id,
        userId: ownerId,
        state: 'processing',
        active: true,
        formatVersion: 3,
        attempts: 1,
        nextAttemptAt: expired,
        claimId,
        leaseExpiresAt: expired,
      });
      const store = new MongoAccountExportStore(exportJobs, users, connection);
      await expect(
        store.complete({
          id,
          claimId,
          ownerUserId: ownerId,
          expectedProgressEpoch: epoch,
          completedAt: new Date(),
          artifactGeneration: claimId,
          artifactExpiresAt: new Date(Date.now() + 86_400_000),
          result: {
            format: 'los-apuntes-account-export',
            formatVersion: 3,
            sectionCount: 32,
            recordCount: 0,
            byteLength: 128,
            sha256: 'a'.repeat(64),
          },
        }),
      ).resolves.toBe(false);
      expect(await account.getStudyProgressExportEpoch(ownerId)).toBe(epoch);
      expect((await exportJobs.findOne({ id }).lean().exec())?.state).toBe(
        'processing',
      );
    }, 30_000);

    it('B66 recovers an actually committed Mongo export after its response is lost', async () => {
      const userId = await owner();
      const subjectId = randomUUID();
      await service.save(userId, subjectId, 0, planFor(subjectId));
      const id = randomUUID();
      const claimId = randomUUID();
      const created = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 3,
        attempts: 1,
        nextAttemptAt: created,
        claimId,
        leaseExpiresAt: new Date(created.getTime() + 120_000),
      });
      const store = new MongoAccountExportStore(exportJobs, users, connection);
      const job = (await store.findOwned(id, userId)) as AccountExportJobRecord;
      const userReader = new UsersService(users as never);
      const assembly = {
        format: 'los-apuntes-account-export' as const,
        formatVersion: 3 as const,
        sectionCount: 32,
        recordCount: 1,
        byteLength: 256,
        sha256: 'a'.repeat(64),
      };
      let s3Committed = false;
      const deleteArtifact = jest.fn().mockResolvedValue(undefined);
      const artifacts = {
        createSink: jest.fn().mockReturnValue({
          write: jest.fn().mockResolvedValue(undefined),
          commit: jest.fn().mockImplementation(() => {
            s3Committed = true;
            return Promise.resolve();
          }),
          abort: jest.fn().mockResolvedValue(undefined),
        }),
        deleteArtifact,
      } as unknown as AccountExportArtifactStorage;
      const assembler = {
        writeJsonV3: async (
          _owner: string,
          sink: AccountExportArtifactSink,
        ) => {
          // The artifact sink is a test double; Mongo commit and lookup are real.
          await sink.write('private-v3');
          await sink.commit(assembly);
          return assembly;
        },
      } as unknown as AccountExportAssembler;
      const complete = jest.fn(
        async (input: {
          id: string;
          claimId: string;
          ownerUserId: string;
          expectedProgressEpoch: number;
        }) => {
          const committed = await store.complete({
            ...input,
            artifactGeneration: input.claimId,
            completedAt: new Date(),
            artifactExpiresAt: new Date(Date.now() + 86_400_000),
            result: assembly,
          });
          expect(committed).toBe(true);
          // Simulate network failure only AFTER the Mongo transaction committed.
          throw new Error('Mongo commit reply lost after success');
        },
      );
      const reschedule = jest.fn();
      const workerService = {
        claimNext: jest.fn().mockResolvedValueOnce(job),
        captureStudyProgressExportEpoch: (ownerId: string) =>
          userReader.getStudyProgressExportEpoch(ownerId),
        assertStudyProgressExportEpoch: async (
          ownerId: string,
          expected: number,
        ) => {
          expect(await userReader.getStudyProgressExportEpoch(ownerId)).toBe(
            expected,
          );
        },
        complete,
        reschedule,
        renewLease: jest.fn().mockResolvedValue(true),
      } as unknown as AccountExportService;
      const processor = new AccountExportProcessor(
        workerService,
        assembler,
        store,
        artifacts,
        {
          enqueue: jest.fn().mockResolvedValue(undefined),
          clearPending: jest.fn().mockResolvedValue(true),
          claimNext: jest.fn().mockResolvedValue(null),
          renewLease: jest.fn().mockResolvedValue(true),
          acknowledge: jest.fn(),
          retry: jest.fn(),
        } satisfies AccountExportOrphanCleanupStore,
      );
      await expect(processor.runIteration()).resolves.toMatchObject({
        claimed: 1,
        completed: 1,
        stale: 0,
        retryScheduled: 0,
      });
      expect(s3Committed).toBe(true);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(reschedule).not.toHaveBeenCalled();
      expect(deleteArtifact).not.toHaveBeenCalled();
      const durable = await store.findOwned(id, userId);
      expect(durable?.state).toBe('completed');
      expect(durable?.artifactGeneration).toBe(claimId);
      expect(durable?.artifactSha256).toBe(assembly.sha256);
    }, 30_000);

    it('B66 queues an orphan only after a real Mongo reschedule commits', async () => {
      const userId = await owner();
      const id = randomUUID();
      const claimId = randomUUID();
      const created = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 3,
        attempts: 1,
        nextAttemptAt: created,
        claimId,
        leaseExpiresAt: new Date(created.getTime() + 120_000),
      });
      const store = new MongoAccountExportStore(exportJobs, users, connection);
      const job = (await store.findOwned(id, userId)) as AccountExportJobRecord;
      const reader = new UsersService(users as never);
      const operations: string[] = [];
      const deleteArtifact = jest.fn().mockImplementation(async () => {
        const row = await store.findOwned(id, userId);
        expect(row?.state).toBe('pending');
        operations.push('delete-S3');
      });
      const artifacts = {
        createSink: jest.fn().mockReturnValue({
          write: jest.fn().mockResolvedValue(undefined),
          commit: jest.fn().mockResolvedValue(undefined),
          abort: jest.fn().mockResolvedValue(undefined),
        }),
        deleteArtifact,
      } as unknown as AccountExportArtifactStorage;
      const assembly = {
        format: 'los-apuntes-account-export' as const,
        formatVersion: 3 as const,
        sectionCount: 32,
        recordCount: 0,
        byteLength: 128,
        sha256: 'a'.repeat(64),
      };
      const workerService = {
        claimNext: jest.fn().mockResolvedValueOnce(job),
        renewLease: jest.fn().mockResolvedValue(true),
        captureStudyProgressExportEpoch: (ownerId: string) =>
          reader.getStudyProgressExportEpoch(ownerId),
        assertStudyProgressExportEpoch: () => Promise.resolve(),
        complete: jest.fn().mockRejectedValue(new Error('Mongo reply unknown')),
        reschedule: async (input: {
          id: string;
          claimId: string;
          state: 'pending' | 'failed';
          nextAttemptAt: Date;
          failureCode: 'EXPORT_ASSEMBLY_RETRY';
        }) => {
          const updated = await store.reschedule({ ...input, now: new Date() });
          if (updated) operations.push('reschedule-committed');
          return updated;
        },
      } as unknown as AccountExportService;
      const assembler = {
        writeJsonV3: async (
          _owner: string,
          sink: AccountExportArtifactSink,
        ) => {
          await sink.write('orphaned-v3');
          await sink.commit(assembly);
          return assembly;
        },
      } as unknown as AccountExportAssembler;
      const processor = new AccountExportProcessor(
        workerService,
        assembler,
        store,
        artifacts,
        {
          enqueue: jest.fn().mockResolvedValue(undefined),
          clearPending: jest.fn().mockResolvedValue(true),
          claimNext: jest.fn().mockResolvedValue(null),
          renewLease: jest.fn().mockResolvedValue(true),
          acknowledge: jest.fn(),
          retry: jest.fn(),
        } satisfies AccountExportOrphanCleanupStore,
      );
      await expect(processor.runIteration()).resolves.toMatchObject({
        claimed: 1,
        retryScheduled: 1,
        completed: 0,
      });
      expect(operations).toEqual(['reschedule-committed']);
      expect(deleteArtifact).not.toHaveBeenCalled();
      const durable = await store.findOwned(id, userId);
      expect(durable?.state).toBe('pending');
      expect(durable?.artifactGeneration).toBeNull();
    }, 30_000);

    it('B67 retains an orphan cleanup task across a crashed worker lease', async () => {
      const ownerId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const store = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      const now = new Date();
      await store.enqueue({
        jobId: id,
        ownerUserId: ownerId,
        generation,
        now,
      });
      await store.enqueue({
        jobId: id,
        ownerUserId: ownerId,
        generation,
        now,
      });
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );
      const firstClaim = randomUUID();
      const leased = await store.claimNext({
        now,
        claimId: firstClaim,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      });
      expect(leased).toMatchObject({ jobId: id, generation, attempts: 1 });
      // Lost process: Mongo retains the attempt. It is not claimable early.
      await expect(
        store.claimNext({
          now,
          claimId: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + 120_000),
        }),
      ).resolves.toBeNull();
      const secondClaim = randomUUID();
      // B84: expire the lease in the isolated Mongo fixture. Advancing only
      // worker.now must no longer authorize a real primary takeover.
      await orphanJobs.updateOne(
        { jobId: id, generation },
        {
          $set: { leaseExpiresAt: new Date(Date.now() - 1_000) },
        },
      );
      const later = new Date();
      const reclaimed = await store.claimNext({
        now: later,
        claimId: secondClaim,
        leaseExpiresAt: new Date(later.getTime() + 120_000),
      });
      expect(reclaimed).toMatchObject({ claimId: secondClaim, attempts: 2 });
      await expect(
        store.acknowledge({
          jobId: id,
          generation,
          claimId: firstClaim,
          now: later,
        }),
      ).resolves.toBe(false);
      await expect(
        store.acknowledge({
          jobId: id,
          generation,
          claimId: secondClaim,
          now: later,
        }),
      ).resolves.toBe(true);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
    }, 30_000);

    it('B67 retries a failed deletion without losing a durable orphan record', async () => {
      const ownerId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const store = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      const now = new Date();
      await store.enqueue({ jobId: id, ownerUserId: ownerId, generation, now });
      const first = await store.claimNext({
        now,
        claimId: randomUUID(),
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      });
      expect(first).not.toBeNull();
      const future = new Date(now.getTime() + 30_000);
      await expect(
        store.retry({
          jobId: id,
          generation,
          claimId: first!.claimId,
          now,
          nextAttemptAt: future,
        }),
      ).resolves.toBe(true);
      const persisted = await orphanJobs
        .findOne({ jobId: id, generation })
        .lean()
        .exec();
      expect(persisted).toMatchObject({ state: 'pending', attempts: 1 });
      await expect(
        store.claimNext({
          now,
          claimId: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + 120_000),
        }),
      ).resolves.toBeNull();
      // B84: advance the isolated durable due date rather than passing a
      // future clock to Mongo. The primary remains the source of truth.
      await orphanJobs.updateOne(
        { jobId: id, generation },
        {
          $set: { nextAttemptAt: new Date(Date.now() - 1_000) },
        },
      );
      const claimAt = new Date();
      const second = await store.claimNext({
        now: claimAt,
        claimId: randomUUID(),
        leaseExpiresAt: new Date(claimAt.getTime() + 120_000),
      });
      expect(second).toMatchObject({ attempts: 2 });
    }, 30_000);

    it('B68 fences two Mongo orphan workers to one current cleanup claim', async () => {
      // All tests share only this disposable local database. Isolate due tasks.
      await orphanJobs.deleteMany({});
      const ownerId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const queueA = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      const queueB = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      const now = new Date();
      await queueA.enqueue({
        jobId: id,
        generation,
        ownerUserId: ownerId,
        now,
      });

      const firstId = randomUUID();
      const secondId = randomUUID();
      const expires = new Date(now.getTime() + 120_000);
      const [first, second] = await Promise.all([
        queueA.claimNext({ now, claimId: firstId, leaseExpiresAt: expires }),
        queueB.claimNext({ now, claimId: secondId, leaseExpiresAt: expires }),
      ]);
      const winners = [first, second].filter((candidate) => candidate !== null);
      expect(winners).toHaveLength(1);
      const winner = winners[0];
      const loserClaim = winner.claimId === firstId ? secondId : firstId;

      const extended = new Date(now.getTime() + 180_000);
      await expect(
        queueA.renewLease({
          jobId: id,
          generation,
          claimId: winner.claimId,
          now,
          leaseExpiresAt: extended,
        }),
      ).resolves.toBe(true);
      await expect(
        queueB.renewLease({
          jobId: id,
          generation,
          claimId: loserClaim,
          now,
          leaseExpiresAt: extended,
        }),
      ).resolves.toBe(false);
      await expect(
        queueB.acknowledge({
          jobId: id,
          generation,
          claimId: loserClaim,
          now,
        }),
      ).resolves.toBe(false);
      await expect(
        queueA.acknowledge({
          jobId: id,
          generation,
          claimId: winner.claimId,
          now,
        }),
      ).resolves.toBe(true);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
    }, 30_000);

    it('B68 reads the true durable owner and rejects a mismatched cleanup task', async () => {
      await orphanJobs.deleteMany({});
      const realOwner = await owner();
      const foreignOwner = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId: realOwner,
        state: 'completed',
        active: false,
        formatVersion: 3,
        attempts: 1,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
        completedAt: now,
        artifactGeneration: generation,
        artifactSectionCount: 32,
        artifactRecordCount: 0,
        artifactByteLength: 128,
        artifactSha256: 'a'.repeat(64),
        artifactExpiresAt: new Date(now.getTime() + 86_400_000),
      });
      const jobsStore = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
      );
      expect(await jobsStore.findOwned(id, foreignOwner)).toBeNull();
      expect((await jobsStore.findForOrphanCleanup(id))?.userId).toBe(
        realOwner,
      );

      const cleanupStore = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await cleanupStore.enqueue({
        jobId: id,
        generation,
        ownerUserId: foreignOwner,
        now,
      });
      const deleteArtifact = jest.fn().mockResolvedValue(undefined);
      const exporter = {
        claimNext: jest.fn().mockResolvedValue(null),
      } as unknown as AccountExportService;
      const assembler = {} as AccountExportAssembler;
      const artifacts = {
        deleteArtifact,
      } as unknown as AccountExportArtifactStorage;
      const processor = new AccountExportProcessor(
        exporter,
        assembler,
        jobsStore,
        artifacts,
        cleanupStore,
      );
      await expect(processor.runIteration()).resolves.toMatchObject({
        orphanDeleted: 0,
        orphanPreserved: 0,
        orphanRetries: 1,
      });
      expect(deleteArtifact).not.toHaveBeenCalled();
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );
    }, 30_000);

    it('B69 recovers write-ahead orphan intent across two workers after S3 rejects the first delete', async () => {
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: generation,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      });
      const exportsStore = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
      );
      const orphans = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      const job = (await exportsStore.findOwned(
        id,
        userId,
      )) as AccountExportJobRecord;
      const assembly = {
        format: 'los-apuntes-account-export' as const,
        formatVersion: 1 as const,
        sectionCount: 30,
        recordCount: 0,
        byteLength: 128,
        sha256: 'a'.repeat(64),
      };
      const deleteArtifact = jest
        .fn()
        .mockRejectedValueOnce(new Error('S3 transient deletion outage'))
        .mockResolvedValue(undefined);
      const artifacts = {
        createSink: jest.fn().mockReturnValue({
          write: jest.fn().mockResolvedValue(undefined),
          commit: jest.fn().mockResolvedValue(undefined),
          abort: jest.fn().mockResolvedValue(undefined),
        }),
        deleteArtifact,
      } as unknown as AccountExportArtifactStorage;
      const assembler = {
        writeJsonV1: async (
          _owner: string,
          sink: AccountExportArtifactSink,
        ) => {
          await sink.write('export-v1');
          await sink.commit(assembly);
          return assembly;
        },
      } as unknown as AccountExportAssembler;
      const firstService = {
        claimNext: jest.fn().mockResolvedValueOnce(job).mockResolvedValue(null),
        renewLease: jest.fn().mockResolvedValue(true),
        complete: jest
          .fn()
          .mockRejectedValue(new Error('Mongo completion response unknown')),
        reschedule: (input: {
          id: string;
          claimId: string;
          state: 'pending' | 'failed';
          nextAttemptAt: Date;
          failureCode: 'EXPORT_ASSEMBLY_RETRY';
        }) => exportsStore.reschedule({ ...input, now: new Date() }),
      } as unknown as AccountExportService;
      const first = new AccountExportProcessor(
        firstService,
        assembler,
        exportsStore,
        artifacts,
        orphans,
      );
      await expect(first.runIteration()).resolves.toMatchObject({
        claimed: 1,
        retryScheduled: 1,
        orphanDeleted: 0,
      });
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );
      const stored = await orphanJobs
        .findOne({ jobId: id, generation })
        .lean()
        .exec();
      expect(stored).toMatchObject({
        state: 'pending',
        attempts: 0,
        ownerUserId: userId,
      });
      expect((await exportsStore.findOwned(id, userId))?.state).toBe('pending');

      // Restart: no previous in-memory processor, but Mongo still has the task.
      const second = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        assembler,
        exportsStore,
        artifacts,
        new MongoAccountExportOrphanCleanupStore(orphanJobs),
      );
      await expect(second.runIteration()).resolves.toMatchObject({
        claimed: 0,
        orphanDeleted: 0,
        orphanRetries: 1,
      });
      expect(deleteArtifact).toHaveBeenCalledTimes(1);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );
      // Advance only this isolated fixture's durable retry date.
      await orphanJobs.updateOne(
        { jobId: id, generation },
        {
          $set: { nextAttemptAt: new Date(Date.now() - 1) },
        },
      );
      await expect(second.runIteration()).resolves.toMatchObject({
        claimed: 0,
        orphanDeleted: 1,
        orphanRetries: 0,
      });
      expect(deleteArtifact).toHaveBeenCalledTimes(2);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
    }, 30_000);

    it('B69 never clears a cleanup intent already claimed by another Mongo worker', async () => {
      await orphanJobs.deleteMany({});
      const ownerId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const storeA = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      const storeB = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await storeA.enqueue({
        jobId: id,
        generation,
        ownerUserId: ownerId,
        now,
      });
      const winnerClaim = randomUUID();
      const row = await storeA.claimNext({
        now,
        claimId: winnerClaim,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      });
      expect(row?.claimId).toBe(winnerClaim);
      await expect(
        storeB.clearPending({ jobId: id, generation }),
      ).resolves.toBe(false);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );
      await expect(
        storeA.acknowledge({
          jobId: id,
          generation,
          claimId: winnerClaim,
          now,
        }),
      ).resolves.toBe(true);
    }, 30_000);

    it('B74 atomically records an expired claim generation for delayed S3 cleanup', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const oldGeneration = randomUUID();
      const newGeneration = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: oldGeneration,
        leaseExpiresAt: new Date(now.getTime() - 1),
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      const claimed = await store.claimNext({
        now,
        claimId: newGeneration,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      });
      expect(claimed).toMatchObject({
        id,
        userId,
        state: 'processing',
        claimId: newGeneration,
        attempts: 2,
      });
      const row = await orphanJobs
        .findOne({ jobId: id, generation: oldGeneration })
        .lean()
        .exec();
      expect(row).toMatchObject({
        ownerUserId: userId,
        generation: oldGeneration,
        state: 'pending',
        claimId: null,
        attempts: 0,
      });
      expect(row!.nextAttemptAt.getTime()).toBe(
        now.getTime() + 3 * ACCOUNT_EXPORT_LEASE_DURATION_MS,
      );
      expect(row!.verificationUntil?.getTime()).toBe(
        now.getTime() + 60 * 60_000,
      );
      const fresh = await orphanJobs
        .findOne({
          jobId: id,
          generation: newGeneration,
        })
        .lean()
        .exec();
      expect(fresh).toMatchObject({
        ownerUserId: userId,
        state: 'pending',
        claimId: null,
        verificationUntil: expectedDate,
      });
      expect(fresh!.nextAttemptAt.getTime()).toBe(
        now.getTime() + 4 * ACCOUNT_EXPORT_LEASE_DURATION_MS,
      );
      expect(await orphanJobs.countDocuments({ jobId: id })).toBe(2);
      const deleteArtifact = jest.fn().mockResolvedValue(undefined);
      const worker = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        {} as AccountExportAssembler,
        store,
        { deleteArtifact } as unknown as AccountExportArtifactStorage,
        new MongoAccountExportOrphanCleanupStore(orphanJobs),
      );
      // Do not delete while the old multipart writer may still be settling.
      await expect(worker.runIteration()).resolves.toMatchObject({
        orphanDeleted: 0,
        orphanRetries: 0,
      });
      expect(deleteArtifact).not.toHaveBeenCalled();
      await orphanJobs.updateOne(
        { jobId: id, generation: oldGeneration },
        {
          $set: { nextAttemptAt: new Date(Date.now() - 1) },
        },
      );
      // First successful DELETE is not a terminal ACK: a late multipart
      // completion could recreate the old key while the verification window
      // is still open.
      await expect(worker.runIteration()).resolves.toMatchObject({
        orphanVerificationScheduled: 1,
        orphanDeleted: 0,
        orphanRetries: 0,
      });
      expect(
        await orphanJobs.countDocuments({
          jobId: id,
          generation: oldGeneration,
        }),
      ).toBe(1);
      expect(deleteArtifact).toHaveBeenCalledWith(id, oldGeneration);
      expect(deleteArtifact).not.toHaveBeenCalledWith(id, newGeneration);

      // Simulate a crashed worker and an old object reappearing after the
      // first DELETE. Force the isolated test's horizon to its final pass.
      await orphanJobs.updateOne(
        { jobId: id, generation: oldGeneration },
        {
          $set: {
            nextAttemptAt: new Date(Date.now() - 1),
            verificationUntil: new Date(Date.now() - 1),
          },
        },
      );
      const restarted = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        {} as AccountExportAssembler,
        new MongoAccountExportStore(exportJobs, users, connection, orphanJobs),
        { deleteArtifact } as unknown as AccountExportArtifactStorage,
        new MongoAccountExportOrphanCleanupStore(orphanJobs),
      );
      await expect(restarted.runIteration()).resolves.toMatchObject({
        orphanDeleted: 1,
        orphanVerificationScheduled: 0,
        orphanRetries: 0,
      });
      expect(deleteArtifact).toHaveBeenCalledTimes(2);
      expect(deleteArtifact).toHaveBeenNthCalledWith(2, id, oldGeneration);
      expect(
        await orphanJobs.countDocuments({
          jobId: id,
          generation: oldGeneration,
        }),
      ).toBe(0);
    }, 30_000);

    it('B78 late stale worker cannot bypass the takeover cleanup deadline', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const previousGeneration = randomUUID();
      const nextGeneration = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: previousGeneration,
        leaseExpiresAt: new Date(now.getTime() - 1),
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      const previous = (await store.findOwned(
        id,
        userId,
      )) as AccountExportJobRecord;
      await expect(
        store.claimNext({
          now,
          claimId: nextGeneration,
          leaseExpiresAt: new Date(
            now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
          ),
        }),
      ).resolves.toMatchObject({ claimId: nextGeneration });
      const before = await orphanJobs
        .findOne({
          jobId: id,
          generation: previousGeneration,
        })
        .lean()
        .exec();
      expect(before?.verificationUntil).toEqual(
        new Date(now.getTime() + 60 * 60_000),
      );
      expect(before?.nextAttemptAt).toEqual(
        new Date(now.getTime() + 3 * ACCOUNT_EXPORT_LEASE_DURATION_MS),
      );

      const deleteArtifact = jest.fn().mockResolvedValue(undefined);
      const artifacts = {
        createSink: jest.fn().mockReturnValue({
          write: jest.fn(),
          commit: jest.fn(),
          abort: jest.fn(),
        }),
        deleteArtifact,
      } as unknown as AccountExportArtifactStorage;
      const assembler = {
        writeJsonV1: jest.fn().mockResolvedValue({
          format: 'los-apuntes-account-export',
          formatVersion: 1,
          sectionCount: 30,
          recordCount: 0,
          byteLength: 128,
          sha256: 'a'.repeat(64),
        }),
      } as unknown as AccountExportAssembler;
      const staleWorker = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValueOnce(previous),
          renewLease: jest.fn().mockResolvedValue(true),
          complete: jest.fn().mockResolvedValue(false),
        } as unknown as AccountExportService,
        assembler,
        store,
        artifacts,
        new MongoAccountExportOrphanCleanupStore(orphanJobs),
      );
      await expect(staleWorker.runIteration()).resolves.toMatchObject({
        claimed: 1,
        stale: 1,
        orphanDeleted: 0,
      });
      expect(deleteArtifact).not.toHaveBeenCalled();
      const after = await orphanJobs
        .findOne({
          jobId: id,
          generation: previousGeneration,
        })
        .lean()
        .exec();
      expect(after?.verificationUntil).toEqual(before?.verificationUntil);
      expect(after?.nextAttemptAt).toEqual(before?.nextAttemptAt);
      expect(after?.state).toBe('pending');
      expect(
        await orphanJobs.countDocuments({
          jobId: id,
          generation: previousGeneration,
        }),
      ).toBe(1);
    }, 30_000);

    it('B77 keeps an expired cleanup lease blocked until its new settlement date', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const oldGeneration = randomUUID();
      const newGeneration = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: oldGeneration,
        leaseExpiresAt: new Date(now.getTime() - 1),
      });
      const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await queue.enqueue({
        jobId: id,
        ownerUserId: userId,
        generation: oldGeneration,
        now,
      });
      const oldQueueClaim = randomUUID();
      const original = await queue.claimNext({
        now,
        claimId: oldQueueClaim,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      });
      expect(original?.claimId).toBe(oldQueueClaim);

      const exportStore = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      const taken = await exportStore.claimNext({
        now,
        claimId: newGeneration,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      });
      expect(taken?.claimId).toBe(newGeneration);
      const queued = await orphanJobs
        .findOne({ jobId: id, generation: oldGeneration })
        .lean()
        .exec();
      const settling = new Date(
        now.getTime() + 3 * ACCOUNT_EXPORT_LEASE_DURATION_MS,
      );
      const deadline = new Date(now.getTime() + 60 * 60_000);
      expect(queued?.nextAttemptAt).toEqual(settling);
      expect(queued?.verificationUntil).toEqual(deadline);
      expect(queued?.claimId).toBe(oldQueueClaim);

      const leaseExpiredButNotDue = new Date(now.getTime() + 61_000);
      await expect(
        queue.claimNext({
          now: leaseExpiredButNotDue,
          claimId: randomUUID(),
          leaseExpiresAt: new Date(leaseExpiredButNotDue.getTime() + 120_000),
        }),
      ).resolves.toBeNull();

      // B84: the old settlement/lease have genuinely passed in this
      // isolated Mongo fixture. A fake future client timestamp is forbidden.
      await orphanJobs.updateOne(
        { jobId: id, generation: oldGeneration },
        {
          $set: {
            nextAttemptAt: new Date(Date.now() - 1_000),
            leaseExpiresAt: new Date(Date.now() - 1_000),
          },
        },
      );
      const due = new Date();
      const reclaimed = await queue.claimNext({
        now: due,
        claimId: randomUUID(),
        leaseExpiresAt: new Date(due.getTime() + 120_000),
      });
      expect(reclaimed).toMatchObject({
        jobId: id,
        generation: oldGeneration,
        verificationUntil: deadline,
        attempts: 2,
      });
    }, 30_000);

    it('B77 refuses stale claimant renew/retry after takeover extends the horizon', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const oldGeneration = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: oldGeneration,
        leaseExpiresAt: new Date(now.getTime() - 1),
      });
      const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await queue.enqueue({
        jobId: id,
        ownerUserId: userId,
        generation: oldGeneration,
        now,
      });
      const oldQueueClaim = randomUUID();
      const oldLease = new Date(now.getTime() + 120_000);
      await queue.claimNext({
        now,
        claimId: oldQueueClaim,
        leaseExpiresAt: oldLease,
      });
      const exportStore = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await exportStore.claimNext({
        now,
        claimId: randomUUID(),
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      });
      const earlier = new Date(now.getTime() + 30_000);
      await expect(
        queue.renewLease({
          jobId: id,
          generation: oldGeneration,
          claimId: oldQueueClaim,
          now,
          leaseExpiresAt: new Date(now.getTime() + 180_000),
          verificationUntil: null,
        }),
      ).resolves.toBe(false);
      await expect(
        queue.retry({
          jobId: id,
          generation: oldGeneration,
          claimId: oldQueueClaim,
          now,
          nextAttemptAt: earlier,
          verificationUntil: null,
        }),
      ).resolves.toBe(false);
      const persisted = await orphanJobs
        .findOne({
          jobId: id,
          generation: oldGeneration,
        })
        .lean()
        .exec();
      expect(persisted?.state).toBe('processing');
      expect(persisted?.claimId).toBe(oldQueueClaim);
      expect(persisted?.nextAttemptAt?.getTime()).toBe(
        now.getTime() + 3 * ACCOUNT_EXPORT_LEASE_DURATION_MS,
      );
    }, 30_000);

    it('B75 prevents a pre-takeover cleanup claimant from ACKing a newly extended verification window', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const newGeneration = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: generation,
        leaseExpiresAt: new Date(now.getTime() - 1),
      });
      const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await queue.enqueue({ jobId: id, ownerUserId: userId, generation, now });
      const cleanupClaim = randomUUID();
      const alreadyClaimed = await queue.claimNext({
        now,
        claimId: cleanupClaim,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      });
      expect(alreadyClaimed?.verificationUntil ?? null).toBeNull();

      const jobStore = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        jobStore.claimNext({
          now,
          claimId: newGeneration,
          leaseExpiresAt: new Date(now.getTime() + 120_000),
        }),
      ).resolves.toMatchObject({ claimId: newGeneration });
      const extended = await orphanJobs
        .findOne({ jobId: id, generation })
        .lean()
        .exec();
      expect(extended?.verificationUntil?.getTime()).toBe(
        now.getTime() + 60 * 60_000,
      );
      await expect(
        queue.acknowledge({
          jobId: id,
          generation,
          claimId: cleanupClaim,
          now,
        }),
      ).resolves.toBe(false);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );
      // The old worker must release or expire its lease before another worker
      // reclaims the row with the new verification deadline.
    }, 30_000);

    it('B75 prevents the old worker fast path from cancelling a pending takeover verification', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: generation,
        leaseExpiresAt: new Date(now.getTime() - 1),
      });
      const jobStore = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        jobStore.claimNext({
          now,
          claimId: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + 120_000),
        }),
      ).resolves.not.toBeNull();
      const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await expect(queue.clearPending({ jobId: id, generation })).resolves.toBe(
        false,
      );
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );
    }, 30_000);

    it('B74 preserves an expired claim if its takeover cleanup queue cannot be written', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const oldGeneration = randomUUID();
      const newGeneration = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: oldGeneration,
        leaseExpiresAt: new Date(now.getTime() - 1),
      });
      const blockedQueue = {
        updateOne: () => ({
          exec: () => Promise.reject(new Error('B74 injected takeover queue failure')),
        }),
      };
      const broken = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        blockedQueue as never,
      );
      await expect(
        broken.claimNext({
          now,
          claimId: newGeneration,
          leaseExpiresAt: new Date(now.getTime() + 120_000),
        }),
      ).rejects.toThrow('B74 injected takeover queue failure');
      expect((await exportJobs.findOne({ id }).lean().exec())?.claimId).toBe(
        oldGeneration,
      );
      expect(
        await orphanJobs.countDocuments({
          jobId: id,
          generation: oldGeneration,
        }),
      ).toBe(0);
      const repaired = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        repaired.claimNext({
          now,
          claimId: newGeneration,
          leaseExpiresAt: new Date(now.getTime() + 120_000),
        }),
      ).resolves.toMatchObject({ claimId: newGeneration });
      expect(
        await orphanJobs.countDocuments({
          jobId: id,
          generation: oldGeneration,
        }),
      ).toBe(1);
    }, 30_000);

    it('B74 claims ordinary pending exports without orphaning a nonexistent predecessor', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const newGeneration = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'pending',
        active: true,
        formatVersion: 1,
        attempts: 0,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
      });
      const claimed = await new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      ).claimNext({
        now,
        claimId: newGeneration,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      });
      expect(claimed).toMatchObject({
        id,
        userId,
        state: 'processing',
        claimId: newGeneration,
        attempts: 1,
      });
      // B74 has no predecessor, but B80 write-ahead protects the new claim
      // against worker/S3 completion crashes.
      const intent = await orphanJobs
        .findOne({
          jobId: id,
          generation: newGeneration,
        })
        .lean()
        .exec();
      expect(intent).toMatchObject({
        ownerUserId: userId,
        state: 'pending',
        claimId: null,
        verificationUntil: expectedDate,
      });
      expect(intent!.nextAttemptAt.getTime()).toBe(
        now.getTime() + 4 * ACCOUNT_EXPORT_LEASE_DURATION_MS,
      );
      expect(await orphanJobs.countDocuments({ jobId: id })).toBe(1);
    }, 30_000);

    it('B82 cleanup wins: stale pre-expiry completion cannot publish after revoked claim', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const started = new Date();
      const leaseExpiredAt = new Date(started.getTime() - 10_000);
      const capturedCompletionAt = new Date(leaseExpiredAt.getTime() - 1);
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: started,
        claimId: generation,
        leaseExpiresAt: leaseExpiredAt,
      });
      const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await queue.enqueue({
        jobId: id,
        ownerUserId: userId,
        generation,
        now: new Date(started.getTime() - 1_000),
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      const deleteArtifact = jest.fn().mockResolvedValue(undefined);
      const drainer = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        {} as AccountExportAssembler,
        store,
        { deleteArtifact } as unknown as AccountExportArtifactStorage,
        queue,
      );
      await expect(drainer.runIteration()).resolves.toMatchObject({
        orphanDeleted: 1,
        orphanRetries: 0,
      });
      expect(deleteArtifact).toHaveBeenCalledWith(id, generation);
      const revoked = await exportJobs.findOne({ id }).lean().exec();
      expect(revoked).toMatchObject({
        state: 'pending',
        active: true,
        claimId: null,
        leaseExpiresAt: null,
        failureCode: 'EXPORT_ASSEMBLY_RETRY',
      });

      // This completion was initiated before lease expiry but its Mongo CAS
      // arrives AFTER the cleanup CAS. Old code could have published an S3
      // object that the drainer had already destroyed.
      await expect(
        store.complete({
          id,
          claimId: generation,
          artifactGeneration: generation,
          completedAt: capturedCompletionAt,
          artifactExpiresAt: new Date(started.getTime() + 7 * 24 * 60 * 60_000),
          result: {
            format: 'los-apuntes-account-export',
            formatVersion: 1,
            sectionCount: 30,
            recordCount: 1,
            byteLength: 12,
            sha256: 'a'.repeat(64),
          },
        }),
      ).resolves.toBe(false);
      expect(
        (await store.findOwned(id, userId))?.artifactGeneration,
      ).toBeNull();
    }, 30_000);

    it('B82 completion wins: exact referenced S3 generation is preserved', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const started = new Date();
      const leaseExpiresAt = new Date(started.getTime() + 120_000);
      const capturedCompletionAt = new Date(started.getTime());
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: started,
        claimId: generation,
        leaseExpiresAt,
      });
      const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await queue.enqueue({
        jobId: id,
        ownerUserId: userId,
        generation,
        now: new Date(started.getTime() - 1_000),
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );

      // Completion commits on Mongo while lease is actually valid, and the
      // orphan drainer must preserve the published generation later.
      await expect(
        store.complete({
          id,
          claimId: generation,
          artifactGeneration: generation,
          completedAt: capturedCompletionAt,
          artifactExpiresAt: new Date(started.getTime() + 7 * 24 * 60 * 60_000),
          result: {
            format: 'los-apuntes-account-export',
            formatVersion: 1,
            sectionCount: 30,
            recordCount: 1,
            byteLength: 12,
            sha256: 'a'.repeat(64),
          },
        }),
      ).resolves.toBe(true);
      const deleteArtifact = jest.fn().mockResolvedValue(undefined);
      const drainer = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        {} as AccountExportAssembler,
        store,
        { deleteArtifact } as unknown as AccountExportArtifactStorage,
        queue,
      );
      await expect(drainer.runIteration()).resolves.toMatchObject({
        orphanPreserved: 1,
        orphanDeleted: 0,
      });
      expect(deleteArtifact).not.toHaveBeenCalled();
      expect(
        await store.fenceExpiredClaimForOrphanCleanup({
          id,
          ownerUserId: userId,
          generation,
          now: new Date(),
        }),
      ).toBe(false);
      expect((await store.findOwned(id, userId))?.artifactGeneration).toBe(
        generation,
      );
    }, 30_000);

    it('B82 renewal wins: cleanup CAS fails without revoking an extended lease', async () => {
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + 60_000);
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: generation,
        leaseExpiresAt,
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      const extendedUntil = new Date(now.getTime() + 120_000);
      // Renewal occurs on a genuinely live lease. The cleanup worker's
      // local clock may be erroneously far ahead; Mongo $NOW still protects
      // the newer expiration against premature revocation.
      await expect(
        store.renewLease({
          id,
          claimId: generation,
          now,
          leaseExpiresAt: extendedUntil,
        }),
      ).resolves.toBe(true);
      await expect(
        store.fenceExpiredClaimForOrphanCleanup({
          id,
          ownerUserId: userId,
          generation,
          now: new Date(extendedUntil.getTime() + 1),
        }),
      ).resolves.toBe(false);
      expect(
        (await store.findOwned(id, userId))?.leaseExpiresAt?.getTime(),
      ).toBe(extendedUntil.getTime());
    }, 30_000);

    it.each([1, 2] as const)(
      'B83 v%s rejects late Mongo completion despite an earlier capturedAt',
      async (version) => {
        await exportJobs.deleteMany({});
        const userId = await owner();
        const id = randomUUID();
        const generation = randomUUID();
        const expiredLease = new Date(Date.now() - 10_000);
        const capturedAt = new Date(expiredLease.getTime() - 1);
        await exportJobs.create({
          id,
          userId,
          active: true,
          state: 'processing',
          formatVersion: version,
          attempts: 1,
          nextAttemptAt: capturedAt,
          claimId: generation,
          leaseExpiresAt: expiredLease,
        });
        const store = new MongoAccountExportStore(
          exportJobs,
          users,
          connection,
          orphanJobs,
        );
        // Old client-only filter would accept: expiredLease > capturedAt.
        expect(expiredLease.getTime()).toBeGreaterThan(capturedAt.getTime());
        await expect(
          store.complete({
            id,
            claimId: generation,
            artifactGeneration: generation,
            completedAt: capturedAt,
            artifactExpiresAt: new Date(Date.now() + 86_400_000),
            result: {
              format: 'los-apuntes-account-export',
              formatVersion: version,
              sectionCount: version === 1 ? 30 : 31,
              recordCount: 0,
              byteLength: 128,
              sha256: 'a'.repeat(64),
            },
          }),
        ).resolves.toBe(false);
        const saved = await store.findOwned(id, userId);
        expect(saved?.state).toBe('processing');
        expect(saved?.artifactGeneration).toBeNull();
      },
      30_000,
    );

    it('B83 v3 rollback does not bump owner epoch after server-time lease expiry', async () => {
      await exportJobs.deleteMany({});
      const userId = await owner();
      const userService = new UsersService(users as never);
      const epoch = await userService.getStudyProgressExportEpoch(userId);
      const id = randomUUID();
      const generation = randomUUID();
      const expiredLease = new Date(Date.now() - 10_000);
      await exportJobs.create({
        id,
        userId,
        active: true,
        state: 'processing',
        formatVersion: 3,
        attempts: 1,
        nextAttemptAt: expiredLease,
        claimId: generation,
        leaseExpiresAt: expiredLease,
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        store.complete({
          id,
          claimId: generation,
          artifactGeneration: generation,
          ownerUserId: userId,
          expectedProgressEpoch: epoch,
          completedAt: new Date(expiredLease.getTime() - 1),
          artifactExpiresAt: new Date(Date.now() + 86_400_000),
          result: {
            format: 'los-apuntes-account-export',
            formatVersion: 3,
            sectionCount: 32,
            recordCount: 0,
            byteLength: 128,
            sha256: 'a'.repeat(64),
          },
        }),
      ).resolves.toBe(false);
      expect(await userService.getStudyProgressExportEpoch(userId)).toBe(epoch);
      expect((await store.findOwned(id, userId))?.state).toBe('processing');
    }, 30_000);

    it('B84 rejects an early job claim when worker clock is ahead of the primary', async () => {
      await exportJobs.deleteMany({});
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const futureDue = new Date(now.getTime() + 10 * 60_000);
      await exportJobs.create({
        id,
        userId,
        state: 'pending',
        active: true,
        formatVersion: 1,
        attempts: 0,
        nextAttemptAt: futureDue,
        claimId: null,
        leaseExpiresAt: null,
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        store.claimNext({
          // A faulty worker can believe a future scheduled task is overdue.
          now: new Date(futureDue.getTime() + 60_000),
          claimId: generation,
          leaseExpiresAt: new Date(futureDue.getTime() + 180_000),
        }),
      ).resolves.toBeNull();
      expect((await store.findOwned(id, userId))?.state).toBe('pending');
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
    }, 30_000);

    it('B84 prevents premature takeover of a still-leased export generation', async () => {
      await exportJobs.deleteMany({});
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const currentGeneration = randomUUID();
      const proposedGeneration = randomUUID();
      const now = new Date();
      const liveUntil = new Date(now.getTime() + 10 * 60_000);
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: currentGeneration,
        leaseExpiresAt: liveUntil,
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        store.claimNext({
          now: new Date(liveUntil.getTime() + 60_000),
          claimId: proposedGeneration,
          leaseExpiresAt: new Date(liveUntil.getTime() + 180_000),
        }),
      ).resolves.toBeNull();
      expect((await store.findOwned(id, userId))?.claimId).toBe(
        currentGeneration,
      );
      expect(await orphanJobs.countDocuments({ jobId: id })).toBe(0);
    }, 30_000);

    it('B84 refuses early orphan claims even if client time passes writeahead due', async () => {
      await orphanJobs.deleteMany({});
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const futureDue = new Date(now.getTime() + 10 * 60_000);
      await orphanJobs.create({
        jobId: id,
        ownerUserId: await owner(),
        generation,
        state: 'pending',
        attempts: 0,
        nextAttemptAt: futureDue,
        claimId: null,
        leaseExpiresAt: null,
      });
      const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await expect(
        queue.claimNext({
          now: new Date(futureDue.getTime() + 60_000),
          claimId: randomUUID(),
          leaseExpiresAt: new Date(futureDue.getTime() + 180_000),
        }),
      ).resolves.toBeNull();
      expect(
        (await orphanJobs.findOne({ jobId: id, generation }).lean().exec())
          ?.state,
      ).toBe('pending');
    }, 30_000);

    it('B84 preserves a processing orphan until both lease and settlement are due on Mongo', async () => {
      await orphanJobs.deleteMany({});
      const id = randomUUID();
      const generation = randomUUID();
      const activeCleanup = randomUUID();
      const now = new Date();
      const liveUntil = new Date(now.getTime() + 10 * 60_000);
      await orphanJobs.create({
        jobId: id,
        ownerUserId: await owner(),
        generation,
        state: 'processing',
        attempts: 1,
        nextAttemptAt: new Date(now.getTime() - 60_000),
        claimId: activeCleanup,
        leaseExpiresAt: liveUntil,
      });
      const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await expect(
        queue.claimNext({
          now: new Date(liveUntil.getTime() + 60_000),
          claimId: randomUUID(),
          leaseExpiresAt: new Date(liveUntil.getTime() + 180_000),
        }),
      ).resolves.toBeNull();
      expect(
        (await orphanJobs.findOne({ jobId: id, generation }).lean().exec())
          ?.claimId,
      ).toBe(activeCleanup);
    }, 30_000);

    it('B84 blocks stale ACK, retry and renewal after the settlement due is extended', async () => {
      await orphanJobs.deleteMany({});
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const ownerUserId = await owner();
      const claimId = randomUUID();
      await orphanJobs.create({
        jobId: id,
        ownerUserId,
        generation,
        state: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(now.getTime() - 60_000),
        claimId: null,
        leaseExpiresAt: null,
      });
      const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      const leaseExpiresAt = new Date(now.getTime() + 120_000);
      const claimed = await queue.claimNext({ now, claimId, leaseExpiresAt });
      expect(claimed).toMatchObject({ jobId: id, generation, claimId });
      const extendedUntil = new Date(now.getTime() + 10 * 60_000);
      await orphanJobs.updateOne(
        { jobId: id, generation },
        { $max: { nextAttemptAt: extendedUntil } },
      );
      const fence = { jobId: id, generation, claimId, now };
      await expect(
        queue.renewLease({
          ...fence,
          leaseExpiresAt: new Date(now.getTime() + 180_000),
        }),
      ).resolves.toBe(false);
      await expect(queue.acknowledge(fence)).resolves.toBe(false);
      await expect(
        queue.retry({
          ...fence,
          nextAttemptAt: new Date(now.getTime() + 30_000),
        }),
      ).resolves.toBe(false);
      expect(
        await orphanJobs.findOne({ jobId: id, generation }).lean().exec(),
      ).toMatchObject({
        state: 'processing',
        claimId,
        nextAttemptAt: extendedUntil,
      });
    }, 30_000);

    it('B83 prevents delayed renewal and reschedule from resurrecting expired claims', async () => {
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const expiredLease = new Date(Date.now() - 10_000);
      const staleCapturedAt = new Date(expiredLease.getTime() - 1);
      await exportJobs.create({
        id,
        userId,
        active: true,
        state: 'processing',
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: expiredLease,
        claimId: generation,
        leaseExpiresAt: expiredLease,
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        store.renewLease({
          id,
          claimId: generation,
          now: staleCapturedAt,
          leaseExpiresAt: new Date(Date.now() + 120_000),
        }),
      ).resolves.toBe(false);
      await expect(
        store.reschedule({
          id,
          claimId: generation,
          state: 'pending',
          now: staleCapturedAt,
          nextAttemptAt: new Date(),
          failureCode: 'EXPORT_ASSEMBLY_RETRY',
        }),
      ).resolves.toBe(false);
      const saved = await store.findOwned(id, userId);
      expect(saved?.claimId).toBe(generation);
      expect(saved?.state).toBe('processing');
      expect(saved?.leaseExpiresAt?.getTime()).toBe(expiredLease.getTime());
    }, 30_000);

    it('B83 fails closed if worker clock attempts early orphan revocation', async () => {
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const lease = new Date(now.getTime() + 120_000);
      await exportJobs.create({
        id,
        userId,
        active: true,
        state: 'processing',
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: generation,
        leaseExpiresAt: lease,
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        store.fenceExpiredClaimForOrphanCleanup({
          id,
          ownerUserId: userId,
          generation,
          now: new Date(lease.getTime() + 10_000),
        }),
      ).resolves.toBe(false);
      expect((await store.findOwned(id, userId))?.claimId).toBe(generation);
    }, 30_000);

    it('B80 persists a first-claim recovery intent before any S3 write and rechecks after a crash', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'pending',
        active: true,
        formatVersion: 1,
        attempts: 0,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
      });
      const exportStore = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      const claimed = await exportStore.claimNext({
        now,
        claimId: generation,
        leaseExpiresAt: new Date(
          now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
        ),
      });
      expect(claimed?.claimId).toBe(generation);
      const durable = await orphanJobs
        .findOne({ jobId: id, generation })
        .lean()
        .exec();
      expect(durable).toMatchObject({
        ownerUserId: userId,
        state: 'pending',
        attempts: 0,
        claimId: null,
        verificationUntil: expectedDate,
      });
      expect(durable!.nextAttemptAt.getTime()).toBe(
        now.getTime() + 4 * ACCOUNT_EXPORT_LEASE_DURATION_MS,
      );

      // Simulate a worker killed after the Mongo claim, before a reliable S3 ACK.
      // Queue remains durable without any process-local enqueue callback.
      const deleteArtifact = jest.fn().mockResolvedValue(undefined);
      const cleanup = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      const recovery = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        {} as AccountExportAssembler,
        exportStore,
        { deleteArtifact } as unknown as AccountExportArtifactStorage,
        cleanup,
      );

      // Even an inadvertently due task cannot delete a currently leased claim.
      await orphanJobs.updateOne(
        { jobId: id, generation },
        {
          $set: { nextAttemptAt: new Date(Date.now() - 1) },
        },
      );
      await expect(recovery.runIteration()).resolves.toMatchObject({
        orphanDeleted: 0,
        orphanRetries: 1,
      });
      expect(deleteArtifact).not.toHaveBeenCalled();

      // A crash stops lease heartbeats. Once the durable lease has expired,
      // recovery can delete and preserve the verification recheck task.
      await exportJobs.updateOne(
        { id, claimId: generation },
        {
          $set: { leaseExpiresAt: new Date(Date.now() - 1) },
        },
      );
      await orphanJobs.updateOne(
        { jobId: id, generation },
        {
          $set: { nextAttemptAt: new Date(Date.now() - 1) },
        },
      );
      await expect(recovery.runIteration()).resolves.toMatchObject({
        orphanVerificationScheduled: 1,
        orphanDeleted: 0,
      });
      expect(deleteArtifact).toHaveBeenCalledWith(id, generation);

      // Recovery survives another process restart. Force final horizon in
      // this isolated Mongo fixture to avoid sleeping for an hour.
      await orphanJobs.updateOne(
        { jobId: id, generation },
        {
          $set: {
            nextAttemptAt: new Date(Date.now() - 1),
            verificationUntil: new Date(Date.now() - 1),
          },
        },
      );
      const restarted = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        {} as AccountExportAssembler,
        new MongoAccountExportStore(exportJobs, users, connection, orphanJobs),
        { deleteArtifact } as unknown as AccountExportArtifactStorage,
        new MongoAccountExportOrphanCleanupStore(orphanJobs),
      );
      await expect(restarted.runIteration()).resolves.toMatchObject({
        orphanDeleted: 1,
        orphanVerificationScheduled: 0,
      });
      expect(deleteArtifact).toHaveBeenCalledTimes(2);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
    }, 30_000);

    it('B80 rolls back an ordinary pending claim if its first recovery write fails', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'pending',
        active: true,
        formatVersion: 1,
        attempts: 0,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
      });
      const failing = {
        updateOne: () => ({
          exec: () => Promise.reject(new Error('B80 injected new claim ledger failure')),
        }),
      };
      const broken = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        failing as never,
      );
      await expect(
        broken.claimNext({
          now,
          claimId: generation,
          leaseExpiresAt: new Date(
            now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
          ),
        }),
      ).rejects.toThrow('B80 injected new claim ledger failure');
      expect((await exportJobs.findOne({ id }).lean().exec())?.state).toBe(
        'pending',
      );
      expect(
        (await exportJobs.findOne({ id }).lean().exec())?.claimId,
      ).toBeNull();
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );

      const recovered = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        recovered.claimNext({
          now,
          claimId: generation,
          leaseExpiresAt: new Date(
            now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
          ),
        }),
      ).resolves.toMatchObject({ claimId: generation });
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );
    }, 30_000);

    it('B80 preserves a completed generation and acknowledges its write-ahead intent', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'pending',
        active: true,
        formatVersion: 1,
        attempts: 0,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await store.claimNext({
        now,
        claimId: generation,
        leaseExpiresAt: new Date(
          now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
        ),
      });
      const completedAt = new Date();
      await expect(
        store.complete({
          id,
          claimId: generation,
          artifactGeneration: generation,
          completedAt,
          artifactExpiresAt: new Date(
            completedAt.getTime() + 7 * 24 * 60 * 60_000,
          ),
          result: {
            format: 'los-apuntes-account-export',
            formatVersion: 1,
            sectionCount: 30,
            recordCount: 1,
            byteLength: 12,
            sha256: 'a'.repeat(64),
          },
        }),
      ).resolves.toBe(true);
      await orphanJobs.updateOne(
        { jobId: id, generation },
        {
          $set: { nextAttemptAt: new Date(Date.now() - 1) },
        },
      );
      const deleteArtifact = jest.fn().mockResolvedValue(undefined);
      const drainer = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        {} as AccountExportAssembler,
        store,
        { deleteArtifact } as unknown as AccountExportArtifactStorage,
        new MongoAccountExportOrphanCleanupStore(orphanJobs),
      );
      await expect(drainer.runIteration()).resolves.toMatchObject({
        orphanPreserved: 1,
        orphanDeleted: 0,
      });
      expect(deleteArtifact).not.toHaveBeenCalled();
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
      expect((await store.findOwned(id, userId))?.artifactGeneration).toBe(
        generation,
      );
    }, 30_000);

    it('B72 retires an expired download and drains exact S3 cleanup in the same iteration', async () => {
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 30_000);
      await exportJobs.create({
        id,
        userId,
        state: 'completed',
        active: false,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
        completedAt: new Date(now.getTime() - 86_400_000),
        artifactGeneration: generation,
        artifactExpiresAt: expiresAt,
        artifactSectionCount: 30,
        artifactRecordCount: 0,
        artifactByteLength: 128,
        artifactSha256: 'a'.repeat(64),
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      const deleteArtifact = jest.fn().mockResolvedValue(undefined);
      const processor = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        {} as AccountExportAssembler,
        store,
        { deleteArtifact } as unknown as AccountExportArtifactStorage,
        new MongoAccountExportOrphanCleanupStore(orphanJobs),
      );
      await expect(processor.runIteration()).resolves.toMatchObject({
        expiredRetired: 1,
        expirationStale: 0,
        expirationRetries: 0,
        orphanDeleted: 1,
        expiredDeleted: 0,
      });
      const durable = await exportJobs.findOne({ id }).lean().exec();
      expect(durable?.artifactGeneration).toBeNull();
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
      expect(deleteArtifact).toHaveBeenCalledTimes(1);
      expect(deleteArtifact).toHaveBeenCalledWith(id, generation);
    }, 30_000);

    it('B72 retains durable expiry intent across crash and transient S3 outage', async () => {
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 30_000);
      await exportJobs.create({
        id,
        userId,
        state: 'completed',
        active: false,
        formatVersion: 3,
        attempts: 1,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
        completedAt: new Date(now.getTime() - 86_400_000),
        artifactGeneration: generation,
        artifactExpiresAt: expiresAt,
        artifactSectionCount: 32,
        artifactRecordCount: 0,
        artifactByteLength: 128,
        artifactSha256: 'a'.repeat(64),
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        store.retireExpiredArtifact({
          id,
          generation,
          expiresAt,
          now,
        }),
      ).resolves.toBe(true);
      expect(
        (await exportJobs.findOne({ id }).lean().exec())?.artifactGeneration,
      ).toBeNull();
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );

      const deleteArtifact = jest
        .fn()
        .mockRejectedValueOnce(new Error('S3 temporary outage'))
        .mockResolvedValue(undefined);
      const newProcessor = () =>
        new AccountExportProcessor(
          {
            claimNext: jest.fn().mockResolvedValue(null),
          } as unknown as AccountExportService,
          {} as AccountExportAssembler,
          new MongoAccountExportStore(
            exportJobs,
            users,
            connection,
            orphanJobs,
          ),
          { deleteArtifact } as unknown as AccountExportArtifactStorage,
          new MongoAccountExportOrphanCleanupStore(orphanJobs),
        );
      await expect(newProcessor().runIteration()).resolves.toMatchObject({
        expiredRetired: 0,
        orphanRetries: 1,
        orphanDeleted: 0,
      });
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );
      // Opt-in isolated test only: advance the durable backoff window so a
      // restarted worker can claim the same retry immediately.
      await orphanJobs.updateOne(
        { jobId: id, generation },
        {
          $set: { nextAttemptAt: new Date(Date.now() - 1) },
        },
      );
      await expect(newProcessor().runIteration()).resolves.toMatchObject({
        orphanDeleted: 1,
        orphanRetries: 0,
      });
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
      expect(deleteArtifact).toHaveBeenCalledTimes(2);
    }, 30_000);

    it('B72 rolls back expiry unlink when insertion into the cleanup queue fails', async () => {
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 30_000);
      await exportJobs.create({
        id,
        userId,
        state: 'completed',
        active: false,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
        completedAt: new Date(now.getTime() - 86_400_000),
        artifactGeneration: generation,
        artifactExpiresAt: expiresAt,
        artifactSectionCount: 30,
        artifactRecordCount: 0,
        artifactByteLength: 128,
        artifactSha256: 'a'.repeat(64),
      });
      const unavailableQueue = {
        updateOne: () => ({
          exec: () => Promise.reject(new Error('B72 injected queue failure')),
        }),
      };
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        unavailableQueue as never,
      );
      await expect(
        store.retireExpiredArtifact({
          id,
          generation,
          expiresAt,
          now,
        }),
      ).rejects.toThrow('B72 injected queue failure');
      expect(
        (await exportJobs.findOne({ id }).lean().exec())?.artifactGeneration,
      ).toBe(generation);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
    }, 30_000);

    it('B86 reconciles lost real S3 writer PUT ACK with B80/B82 Mongo recovery and a 503 DELETE retry', async () => {
      await exportJobs.deleteMany({});
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'pending',
        active: true,
        formatVersion: 1,
        attempts: 0,
        nextAttemptAt: new Date(now.getTime() - 1_000),
        claimId: null,
        leaseExpiresAt: null,
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      const claimed = await store.claimNext({
        now,
        claimId: generation,
        leaseExpiresAt: new Date(
          now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
        ),
      });
      expect(claimed?.claimId).toBe(generation);
      const queuedBeforeUpload = await orphanJobs
        .findOne({
          jobId: id,
          generation,
        })
        .lean()
        .exec();
      expect(queuedBeforeUpload).toMatchObject({
        ownerUserId: userId,
        state: 'pending',
        claimId: null,
      });

      const key = `/b86-private-acceptance/exports/${id}/${generation}.json`;
      const objects = new Map<string, Buffer>();
      const httpMethods: string[] = [];
      let deleteFailures = 1;
      // B86 exercises the REAL app S3 signed HTTP adapter, only replacing
      // transport. It never contacts a remote object-storage provider.
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation((url, init) => {
          const request = new URL(
            typeof url === 'string'
              ? url
              : url instanceof URL
                ? url.href
                : url.url,
          );
          expect(request.origin).toBe('http://127.0.0.1:19086');
          expect(request.pathname).toBe(key);
          expect(request.searchParams.has('uploadId')).toBe(false);
          const method = init?.method ?? 'GET';
          httpMethods.push(method);
          if (method === 'PUT') {
            objects.set(key, Buffer.from(init?.body as Uint8Array));
            return Promise.reject(new Error('B86 S3 PUT ACK lost after object commit'));
          }
          if (method === 'DELETE') {
            if (deleteFailures-- > 0)
              return Promise.resolve(new Response(null, { status: 503 }));
            objects.delete(key);
            return Promise.resolve(new Response(null, { status: 204 }));
          }
          return Promise.reject(new Error('Unexpected B86 S3 method'));
        });
      try {
        const s3 = createS3ObjectStorage({
          endpoint: 'http://127.0.0.1:19086',
          bucket: 'b86-private-acceptance',
          region: 'us-east-1',
          accessKeyId: 'fixture-only',
          secretAccessKey: 'fixture-not-a-live-secret',
          configurationPrefix: 'ACCOUNT_EXPORT_S3',
        });
        const artifacts = new S3AccountExportArtifactStorage(s3);
        const sink = artifacts.createSink(id, generation);
        const payload = '{"private":"B86"}';
        await sink.write(payload);
        await expect(
          sink.commit({
            format: 'los-apuntes-account-export',
            formatVersion: 1,
            sectionCount: 30,
            recordCount: 1,
            byteLength: Buffer.byteLength(payload),
            sha256: createHash('sha256').update(payload).digest('hex'),
          }),
        ).rejects.toThrow('ACK lost');
        await sink.abort();
        expect(objects.get(key)?.toString()).toBe(payload);
        expect(httpMethods).toEqual(['PUT']);
        expect((await store.findOwned(id, userId))?.state).toBe('processing');

        // Only in the isolated disposable Mongo DB: force the natural
        // expiration/settlement that would otherwise take minutes.
        await exportJobs.updateOne(
          { id, claimId: generation },
          {
            $set: { leaseExpiresAt: new Date(Date.now() - 1_000) },
          },
        );
        await orphanJobs.updateOne(
          { jobId: id, generation },
          {
            $set: {
              nextAttemptAt: new Date(Date.now() - 1_000),
              verificationUntil: new Date(Date.now() - 1_000),
            },
          },
        );
        const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
        const processor = new AccountExportProcessor(
          {
            claimNext: jest.fn().mockResolvedValue(null),
          } as unknown as AccountExportService,
          {} as AccountExportAssembler,
          store,
          artifacts,
          queue,
        );

        await expect(processor.runIteration()).resolves.toMatchObject({
          orphanDeleted: 0,
          orphanRetries: 1,
          orphanAuthorityBlocked: 0,
        });
        expect(objects.has(key)).toBe(true);
        expect((await store.findOwned(id, userId))?.state).toBe('pending');
        expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
          1,
        );
        // Simulate due retry; do not advance primary time or bypass the CAS.
        await orphanJobs.updateOne(
          { jobId: id, generation },
          {
            $set: { nextAttemptAt: new Date(Date.now() - 1_000) },
          },
        );
        await expect(processor.runIteration()).resolves.toMatchObject({
          orphanDeleted: 1,
          orphanRetries: 0,
        });
        expect(objects.has(key)).toBe(false);
        expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
          0,
        );
        expect(httpMethods).toEqual(['PUT', 'DELETE', 'DELETE']);
        expect(
          (await store.findOwned(id, userId))?.artifactGeneration,
        ).toBeNull();
      } finally {
        fetchSpy.mockRestore();
      }
    }, 30_000);

    it('B86 preserves a published generation when B80 queue recovery claims it', async () => {
      await exportJobs.deleteMany({});
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'pending',
        active: true,
        formatVersion: 1,
        attempts: 0,
        nextAttemptAt: new Date(now.getTime() - 1_000),
        claimId: null,
        leaseExpiresAt: null,
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        store.claimNext({
          now,
          claimId: generation,
          leaseExpiresAt: new Date(
            now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
          ),
        }),
      ).resolves.toMatchObject({ id, claimId: generation });
      const key = `/b86-private-acceptance/exports/${id}/${generation}.json`;
      const objects = new Map<string, Buffer>();
      const httpMethods: string[] = [];
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation((url, init) => {
          const request = new URL(
            typeof url === 'string'
              ? url
              : url instanceof URL
                ? url.href
                : url.url,
          );
          expect(request.pathname).toBe(key);
          const method = init?.method ?? 'GET';
          httpMethods.push(method);
          if (method === 'PUT') {
            objects.set(key, Buffer.from(init?.body as Uint8Array));
            return Promise.resolve(new Response(null, { status: 200 }));
          }
          if (method === 'GET') {
            const bytes = objects.get(key);
            return Promise.resolve(
              bytes
                ? new Response(new Uint8Array(bytes), { status: 200 })
                : new Response(null, { status: 404 }),
            );
          }
          if (method === 'DELETE') {
            objects.delete(key);
            return Promise.resolve(new Response(null, { status: 204 }));
          }
          return Promise.reject(new Error('Unexpected method'));
        });
      try {
        const s3 = createS3ObjectStorage({
          endpoint: 'http://127.0.0.1:19086',
          bucket: 'b86-private-acceptance',
          region: 'us-east-1',
          accessKeyId: 'fixture-only',
          secretAccessKey: 'fixture-not-a-live-secret',
          configurationPrefix: 'ACCOUNT_EXPORT_S3',
        });
        const artifacts = new S3AccountExportArtifactStorage(s3);
        const sink = artifacts.createSink(id, generation);
        const payload = '{"private":"completed"}';
        await sink.write(payload);
        const summary = {
          format: 'los-apuntes-account-export' as const,
          formatVersion: 1 as const,
          sectionCount: 30,
          recordCount: 1,
          byteLength: Buffer.byteLength(payload),
          sha256: createHash('sha256').update(payload).digest('hex'),
        };
        await sink.commit(summary);
        await expect(
          store.complete({
            id,
            claimId: generation,
            artifactGeneration: generation,
            completedAt: new Date(),
            artifactExpiresAt: new Date(Date.now() + 86_400_000),
            result: summary,
          }),
        ).resolves.toBe(true);
        await orphanJobs.updateOne(
          { jobId: id, generation },
          {
            $set: { nextAttemptAt: new Date(Date.now() - 1_000) },
          },
        );
        const processor = new AccountExportProcessor(
          {
            claimNext: jest.fn().mockResolvedValue(null),
          } as unknown as AccountExportService,
          {} as AccountExportAssembler,
          store,
          artifacts,
          new MongoAccountExportOrphanCleanupStore(orphanJobs),
        );
        await expect(processor.runIteration()).resolves.toMatchObject({
          orphanPreserved: 1,
          orphanDeleted: 0,
          orphanRetries: 0,
        });
        expect(httpMethods).toEqual(['PUT', 'GET']);
        expect(objects.has(key)).toBe(true);
        expect((await store.findOwned(id, userId))?.artifactGeneration).toBe(
          generation,
        );
        expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
          0,
        );
      } finally {
        fetchSpy.mockRestore();
      }
    }, 30_000);

    it('B90 refuses to publish corrupt same-size S3 GET bytes and retains B80 recovery intent', async () => {
      await exportJobs.deleteMany({});
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'pending',
        active: true,
        formatVersion: 1,
        attempts: 0,
        nextAttemptAt: new Date(now.getTime() - 1_000),
        claimId: null,
        leaseExpiresAt: null,
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        store.claimNext({
          now,
          claimId: generation,
          leaseExpiresAt: new Date(
            now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
          ),
        }),
      ).resolves.toMatchObject({ claimId: generation });
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );

      const key = `/b90-readback/exports/${id}/${generation}.json`;
      const objects = new Map<string, Buffer>();
      const methods: string[] = [];
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation((url, init) => {
          const request = new URL(
            typeof url === 'string'
              ? url
              : url instanceof URL
                ? url.href
                : url.url,
          );
          expect(request.pathname).toBe(key);
          const method = init?.method ?? 'GET';
          methods.push(method);
          if (method === 'PUT') {
            objects.set(key, Buffer.from(init?.body as Uint8Array));
            return Promise.resolve(new Response(null, { status: 200 }));
          }
          if (method === 'GET') {
            const persisted = objects.get(key);
            if (!persisted)
              return Promise.resolve(new Response(null, { status: 404 }));
            const poisoned = Buffer.from(persisted);
            poisoned[5] ^= 0x01;
            return Promise.resolve(
              new Response(new Uint8Array(poisoned), { status: 200 }),
            );
          }
          throw new Error(
            'B90 unexpected S3 operation; no direct DELETE permitted',
          );
        });
      try {
        const s3 = createS3ObjectStorage({
          endpoint: 'http://127.0.0.1:19086',
          bucket: 'b90-readback',
          region: 'us-east-1',
          accessKeyId: 'fixture-only',
          secretAccessKey: 'fixture-not-a-live-secret',
          configurationPrefix: 'ACCOUNT_EXPORT_S3',
        });
        const sink = new S3AccountExportArtifactStorage(s3).createSink(
          id,
          generation,
        );
        const payload = '{"private":"B90-readback"}';
        await sink.write(payload);
        await expect(
          sink.commit({
            format: 'los-apuntes-account-export',
            formatVersion: 1,
            sectionCount: 30,
            recordCount: 1,
            byteLength: Buffer.byteLength(payload),
            sha256: createHash('sha256').update(payload).digest('hex'),
          }),
        ).rejects.toThrow('S3 readback SHA-256 mismatch');
        await sink.abort();
        expect(methods).toEqual(['PUT', 'GET']);
        expect(objects.get(key)?.toString()).toBe(payload);
        const job = await store.findOwned(id, userId);
        expect(job?.state).toBe('processing');
        expect(job?.artifactGeneration).toBeNull();
        expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
          1,
        );
      } finally {
        fetchSpy.mockRestore();
      }
    }, 30_000);

    it('B93 Mongo primary authorizes a future artifact even if the worker is ahead', async () => {
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60_000);
      await exportJobs.create({
        id,
        userId,
        state: 'completed',
        active: false,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
        completedAt: new Date(now.getTime() - 60_000),
        artifactGeneration: generation,
        artifactExpiresAt: expiresAt,
        artifactSectionCount: 30,
        artifactRecordCount: 0,
        artifactByteLength: 128,
        artifactSha256: 'a'.repeat(64),
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      // The old client-only download() check would reject an ahead clock.
      expect(expiresAt.getTime()).toBeLessThan(now.getTime() + 20 * 60_000);
      await expect(
        store.isOwnedArtifactCurrent({
          id,
          userId,
          generation,
          expiresAt,
        }),
      ).resolves.toBe(true);
      await expect(
        store.isOwnedArtifactCurrent({
          id,
          userId: randomUUID(),
          generation,
          expiresAt,
        }),
      ).resolves.toBe(false);
      await expect(
        store.isOwnedArtifactCurrent({
          id,
          userId,
          generation: randomUUID(),
          expiresAt,
        }),
      ).resolves.toBe(false);
    }, 30_000);

    it('B93 Mongo primary refuses expired and detached private generations', async () => {
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 10 * 60_000);
      await exportJobs.create({
        id,
        userId,
        state: 'completed',
        active: false,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
        completedAt: new Date(now.getTime() - 86_400_000),
        artifactGeneration: generation,
        artifactExpiresAt: expiresAt,
        artifactSectionCount: 30,
        artifactRecordCount: 0,
        artifactByteLength: 128,
        artifactSha256: 'a'.repeat(64),
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      const input = { id, userId, generation, expiresAt };
      await expect(store.isOwnedArtifactCurrent(input)).resolves.toBe(false);
      // Even after extending the TTL in the fixture, the original
      // captured metadata and a detached generation cannot grant access.
      await exportJobs.updateOne(
        { id, userId },
        {
          $set: { artifactExpiresAt: new Date(now.getTime() + 10 * 60_000) },
        },
      );
      await expect(store.isOwnedArtifactCurrent(input)).resolves.toBe(false);
      await exportJobs.updateOne(
        { id, userId },
        {
          $set: { artifactGeneration: null },
        },
      );
      await expect(store.isOwnedArtifactCurrent(input)).resolves.toBe(false);
    }, 30_000);

    it('B85 protects an unexpired private artifact from a clock-ahead worker', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60_000);
      await exportJobs.create({
        id,
        userId,
        state: 'completed',
        active: false,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
        completedAt: new Date(now.getTime() - 60_000),
        artifactGeneration: generation,
        artifactExpiresAt: expiresAt,
        artifactSectionCount: 30,
        artifactRecordCount: 0,
        artifactByteLength: 128,
        artifactSha256: 'a'.repeat(64),
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      const workerAhead = new Date(expiresAt.getTime() + 60_000);
      // The legacy client-only filter considered this already expired.
      expect(expiresAt.getTime()).toBeLessThan(workerAhead.getTime());
      await expect(
        store.findExpiredArtifacts({
          now: workerAhead,
          limit: 100,
        }),
      ).resolves.toEqual([]);
      await expect(
        store.retireExpiredArtifact({
          id,
          generation,
          expiresAt,
          now: workerAhead,
        }),
      ).resolves.toBe(false);
      const durable = await exportJobs.findOne({ id }).lean().exec();
      expect(durable?.state).toBe('completed');
      expect(durable?.artifactGeneration).toBe(generation);
      expect(durable?.artifactExpiresAt).toEqual(expiresAt);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
    }, 30_000);

    it('B85 due private artifact remains safely retireable with queued generation', async () => {
      await orphanJobs.deleteMany({});
      await exportJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 10 * 60_000);
      await exportJobs.create({
        id,
        userId,
        state: 'completed',
        active: false,
        formatVersion: 3,
        attempts: 1,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
        completedAt: new Date(now.getTime() - 86_400_000),
        artifactGeneration: generation,
        artifactExpiresAt: expiresAt,
        artifactSectionCount: 32,
        artifactRecordCount: 0,
        artifactByteLength: 128,
        artifactSha256: 'a'.repeat(64),
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      const candidates = await store.findExpiredArtifacts({ now, limit: 100 });
      expect(candidates).toEqual(
        expect.arrayContaining([{ id, generation, expiresAt }]),
      );
      await expect(
        store.retireExpiredArtifact({
          id,
          generation,
          expiresAt,
          now,
        }),
      ).resolves.toBe(true);
      expect(
        (await store.findOwned(id, userId))?.artifactGeneration,
      ).toBeNull();
      const task = await orphanJobs
        .findOne({ jobId: id, generation })
        .lean()
        .exec();
      expect(task).toMatchObject({
        ownerUserId: userId,
        state: 'pending',
        generation,
        claimId: null,
      });
      // S3 deletion is NOT attempted here. It remains owner/lease-fenced in
      // the separate recovery worker after a real server-authorized claim.
    }, 30_000);

    it('B72 refuses a stale expiry CAS after a concurrent retention extension', async () => {
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const oldExpiry = new Date(now.getTime() - 60_000);
      const extendedExpiry = new Date(now.getTime() + 86_400_000);
      await exportJobs.create({
        id,
        userId,
        state: 'completed',
        active: false,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
        artifactGeneration: generation,
        artifactExpiresAt: extendedExpiry,
      });
      const store = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
        orphanJobs,
      );
      await expect(
        store.retireExpiredArtifact({
          id,
          generation,
          expiresAt: oldExpiry,
          now,
        }),
      ).resolves.toBe(false);
      expect(
        (await exportJobs.findOne({ id }).lean().exec())?.artifactGeneration,
      ).toBe(generation);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
    }, 30_000);

    it('B71 recovers an ambiguous S3 multipart completion with real Mongo retry CAS', async () => {
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const started = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'processing',
        active: true,
        formatVersion: 1,
        attempts: 1,
        nextAttemptAt: started,
        claimId: generation,
        leaseExpiresAt: new Date(started.getTime() + 120_000),
      });
      const exportStore = new MongoAccountExportStore(
        exportJobs,
        users,
        connection,
      );
      const queued = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      const claimed = (await exportStore.findOwned(
        id,
        userId,
      )) as AccountExportJobRecord;
      const payload = {
        format: 'los-apuntes-account-export' as const,
        formatVersion: 1 as const,
        sectionCount: 30,
        recordCount: 0,
        byteLength: 128,
        sha256: 'a'.repeat(64),
      };
      const writer = {
        write: jest.fn().mockResolvedValue(undefined),
        commit: jest
          .fn()
          .mockRejectedValueOnce(new Error('S3 multipart ACK lost')),
        abort: jest.fn().mockResolvedValue(undefined),
      };
      const deleteArtifact = jest
        .fn()
        .mockRejectedValueOnce(new Error('S3 DELETE transient outage'))
        .mockResolvedValue(undefined);
      const artifacts = {
        createSink: jest.fn().mockReturnValue(writer),
        deleteArtifact,
      } as unknown as AccountExportArtifactStorage;
      const assembler = {
        writeJsonV1: async (
          _owner: string,
          sink: AccountExportArtifactSink,
        ) => {
          await sink.write('uploaded-before-ack-loss');
          await sink.commit(payload);
          return payload;
        },
      } as unknown as AccountExportAssembler;
      const service = {
        claimNext: jest
          .fn()
          .mockResolvedValueOnce(claimed)
          .mockResolvedValue(null),
        renewLease: jest.fn().mockResolvedValue(true),
        complete: jest.fn().mockResolvedValue(true),
        reschedule: (input: {
          id: string;
          claimId: string;
          state: 'pending' | 'failed';
          nextAttemptAt: Date;
          failureCode: 'EXPORT_ASSEMBLY_RETRY';
        }) => exportStore.reschedule({ ...input, now: new Date() }),
      } as unknown as AccountExportService;

      const first = new AccountExportProcessor(
        service,
        assembler,
        exportStore,
        artifacts,
        queued,
      );
      await expect(first.runIteration()).resolves.toMatchObject({
        claimed: 1,
        completed: 0,
        retryScheduled: 1,
      });
      expect(writer.abort).toHaveBeenCalledTimes(1);
      // B78 and B80 prohibit inline S3 DELETE; only a later owner-fenced
      // drainer can remove the exact generation after the Mongo retry CAS.
      expect(deleteArtifact).not.toHaveBeenCalled();
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );
      expect((await exportStore.findOwned(id, userId))?.state).toBe('pending');

      const restarted = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        assembler,
        exportStore,
        artifacts,
        new MongoAccountExportOrphanCleanupStore(orphanJobs),
      );
      await expect(restarted.runIteration()).resolves.toMatchObject({
        claimed: 0,
        orphanDeleted: 0,
        orphanRetries: 1,
      });
      expect(deleteArtifact).toHaveBeenCalledTimes(1);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        1,
      );
      await orphanJobs.updateOne(
        { jobId: id, generation },
        {
          $set: { nextAttemptAt: new Date(Date.now() - 1) },
        },
      );
      await expect(restarted.runIteration()).resolves.toMatchObject({
        claimed: 0,
        orphanDeleted: 1,
        orphanRetries: 0,
      });
      expect(deleteArtifact).toHaveBeenCalledTimes(2);
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
    }, 30_000);

    it('B70 keeps an orphan task but never touches S3 when the durable job is missing', async () => {
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const jobId = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await queue.enqueue({ jobId, ownerUserId: userId, generation, now });

      const deleteArtifact = jest.fn().mockResolvedValue(undefined);
      const artifacts = {
        deleteArtifact,
      } as unknown as AccountExportArtifactStorage;
      const processor = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        {} as AccountExportAssembler,
        new MongoAccountExportStore(exportJobs, users, connection),
        artifacts,
        queue,
      );

      await expect(processor.runIteration()).resolves.toMatchObject({
        claimed: 0,
        orphanDeleted: 0,
        orphanAuthorityBlocked: 1,
        orphanRetries: 1,
      });
      expect(deleteArtifact).not.toHaveBeenCalled();
      const persisted = await orphanJobs
        .findOne({ jobId, generation })
        .lean()
        .exec();
      expect(persisted).toMatchObject({
        state: 'pending',
        ownerUserId: userId,
        attempts: 1,
      });
      expect(persisted?.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
    }, 30_000);

    it('B70 preserves a referenced generation even if durable job state is nonterminal', async () => {
      await orphanJobs.deleteMany({});
      const userId = await owner();
      const id = randomUUID();
      const generation = randomUUID();
      const now = new Date();
      await exportJobs.create({
        id,
        userId,
        state: 'pending',
        active: true,
        formatVersion: 3,
        attempts: 1,
        nextAttemptAt: now,
        claimId: null,
        leaseExpiresAt: null,
        artifactGeneration: generation,
      });
      const queue = new MongoAccountExportOrphanCleanupStore(orphanJobs);
      await queue.enqueue({ jobId: id, ownerUserId: userId, generation, now });
      const deleteArtifact = jest.fn().mockResolvedValue(undefined);
      const processor = new AccountExportProcessor(
        {
          claimNext: jest.fn().mockResolvedValue(null),
        } as unknown as AccountExportService,
        {} as AccountExportAssembler,
        new MongoAccountExportStore(exportJobs, users, connection),
        { deleteArtifact } as unknown as AccountExportArtifactStorage,
        queue,
      );
      await expect(processor.runIteration()).resolves.toMatchObject({
        orphanDeleted: 0,
        orphanPreserved: 1,
        orphanRetries: 0,
      });
      expect(deleteArtifact).not.toHaveBeenCalled();
      expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(
        0,
      );
      const durable = await exportJobs.findOne({ id }).lean().exec();
      expect(durable?.artifactGeneration).toBe(generation);
    }, 30_000);

    it('purges progress in account closure transaction and blocks later mutations', async () => {
      const userId = await owner();
      const subjectId = randomUUID();
      await service.save(userId, subjectId, 0, planFor(subjectId));
      const closure = await lifecycle.closeAccount({
        userId,
        expectedCredentialVersion: 1,
        now: new Date(),
        cleanupJobId: randomUUID(),
        auditId: randomUUID(),
      });
      expect(closure.status).toBe('closed');
      expect(await progress.countDocuments({ ownerUserId: userId })).toBe(0);
      await expect(
        service.save(userId, subjectId, 0, planFor(subjectId)),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_PROGRESS_ACCOUNT_INACTIVE' },
      });
    }, 30_000);
  },
);
