import { createHash, randomUUID } from 'node:crypto';
import { createConnection, type Connection, type Model } from 'mongoose';

import { MongoAccountLifecycleStore } from '../../data-lifecycle/mongo/mongo-account-lifecycle.store';
import { MongoAccountExportStore } from '../../data-lifecycle/mongo/mongo-account-export.store';
import { MongoAccountExportOrphanCleanupStore } from '../../data-lifecycle/mongo/mongo-account-export-orphan-cleanup.store';
import { AccountExportOrphanCleanup, AccountExportOrphanCleanupSchema } from '../../data-lifecycle/mongo/account-export-orphan-cleanup.schema';
import { AccountExportJob, AccountExportJobSchema } from '../../data-lifecycle/mongo/account-export.mongo-schema';
import { AccountExportAssembler, type AccountExportArtifactSink } from '../../data-lifecycle/domain/account-export-assembler';
import { AccountExportService } from '../../data-lifecycle/domain/account-export.service';
import { AccountExportProcessor } from '../../data-lifecycle/domain/account-export-processor';
import type { AccountExportArtifactStorage } from '../../data-lifecycle/storage/account-export-artifact-storage';
import type { AccountExportOrphanCleanupStore } from '../../data-lifecycle/domain/account-export-orphan-cleanup.store';
import type { AccountExportJobRecord } from '../../data-lifecycle/domain/account-export.types';
import {
  AccountExportContributorRegistry,
  ACCOUNT_EXPORT_V3_SECTION_IDS,
} from '../../data-lifecycle/domain/account-export-contributor.registry';
import type { AccountExportContributor } from '../../data-lifecycle/domain/account-export.types';
import { StudyProgressExportContributor } from '../../data-lifecycle/contributors/account-export-study-progress.contributor';
import {
  AccountOffboardingJob, AccountOffboardingJobSchema,
  SecurityAudit, SecurityAuditSchema,
} from '../../data-lifecycle/mongo/data-lifecycle.mongo-schemas';
import { OrganizationManager, OrganizationManagerSchema } from '../../organizations/mongo/organization.mongo-schemas';
import { Profile, ProfileSchema } from '../../profile/mongo/profile.mongo-schemas';
import { StudyCollection, StudyCollectionSchema } from '../../study-collections/mongo/study-collection.mongo-schema';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { UsersService } from '../../users/users.service';
import { StudyProgressService } from '../study-progress.service';
import { StudyProgress, StudyProgressSchema } from './study-progress.schema';
import { StudyProgressExportReader } from './study-progress-export.reader';

const uri = process.env.STUDY_PROGRESS_TEST_MONGO_URI;
const runMongo = uri ? describe : describe.skip;
const safeHosts = new Set(['127.0.0.1', 'localhost', 'mongo']);
const database = 'losapuntes_b61_' + randomUUID().replace(/-/gu, '');
const planFor = (subjectId: string) => ({
  format: 'losapuntes.study-session', version: 1, subjectId,
  title: 'Mi plan privado', notes: '', startsAt: null,
  tasks: [{ kind: 'question', id: randomUUID(), minutes: 20, done: false }],
});

runMongo('B61 private progress acceptance on isolated Mongo replica set', () => {
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
    if (parsed.protocol !== 'mongodb:' || !safeHosts.has(parsed.hostname) ||
      parsed.username || parsed.password || !parsed.searchParams.get('replicaSet')) {
      throw new Error('B61 accepts only a local uncredentialed Mongo replica set');
    }
    connection = await createConnection(uri, {
      dbName: database, serverSelectionTimeoutMS: 8_000,
    }).asPromise();
    const hello = await connection.db!.admin().command({ hello: 1 });
    const members: unknown[] = [
      ...(Array.isArray(hello.hosts) ? hello.hosts : []),
      ...(Array.isArray(hello.passives) ? hello.passives : []),
      ...(Array.isArray(hello.arbiters) ? hello.arbiters : []),
      hello.me,
    ].filter((item) => item !== undefined);
    if (hello.isWritablePrimary !== true ||
      typeof hello.setName !== 'string' || members.length === 0 ||
      !members.every((member) => {
        if (typeof member !== 'string') return false;
        const [host, port, extra] = member.split(':');
        return !!host && safeHosts.has(host) && !extra &&
          (port === undefined || /^\d{1,5}$/u.test(port));
      })) {
      throw new Error('B61 refuses unverified or nonlocal Mongo topology');
    }
    verifiedReplica = true;
    users = connection.model(User.name, UserSchema);
    progress = connection.model(StudyProgress.name, StudyProgressSchema);
    const profiles = connection.model(Profile.name, ProfileSchema);
    const managers = connection.model(OrganizationManager.name, OrganizationManagerSchema);
    const jobs = connection.model(AccountOffboardingJob.name, AccountOffboardingJobSchema);
    const audits = connection.model(SecurityAudit.name, SecurityAuditSchema);
    const collections = connection.model(StudyCollection.name, StudyCollectionSchema);
    exportJobs = connection.model(AccountExportJob.name, AccountExportJobSchema);
    orphanJobs = connection.model(AccountExportOrphanCleanup.name, AccountExportOrphanCleanupSchema);
    await Promise.all([users, progress, profiles, managers, jobs, audits, collections, exportJobs, orphanJobs]
      .map((model) => model.init()));
    service = new StudyProgressService(progress, users, connection);
    exportReader = new StudyProgressExportReader(progress);
    lifecycle = new MongoAccountLifecycleStore(
      connection, users, profiles, managers, jobs, audits, collections, progress,
    );
  }, 30_000);

  afterAll(async () => {
    if (verifiedReplica && connection?.readyState === 1) {
      await connection.dropDatabase();
    }
    await connection?.close();
  }, 30_000);

  async function owner() {
    const row = await users.create({
      email: randomUUID() + '@example.invalid',
      role: 'user', account_status: 'active', credential_version: 1,
    });
    return row.id;
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
    await expect(service.save(first, subject, 0, original)).rejects.toMatchObject({
      response: { code: 'STUDY_PROGRESS_REVISION_CONFLICT' },
    });
    await expect(service.save(second, subject, 0, planFor(subject)))
      .resolves.toMatchObject({ progress: { revision: 1 } });
    const next = await service.save(first, subject, 1, {
      ...original, title: 'Repaso actualizado',
    });
    expect(next.progress.revision).toBe(2);
    await expect(service.save(first, subject, 1, original)).rejects.toMatchObject({
      response: { code: 'STUDY_PROGRESS_REVISION_CONFLICT' },
    });
    expect((await service.get(first, subject)).progress.plan)
      .toMatchObject({ title: 'Repaso actualizado' });
    await expect(service.remove(first, subject, 1)).rejects.toMatchObject({
      response: { code: 'STUDY_PROGRESS_REVISION_CONFLICT' },
    });
    await expect(service.remove(first, subject, 2))
      .resolves.toEqual({ deleted: true });
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
    await expect(service.save(userId, extra, 0, planFor(extra))).rejects.toMatchObject({
      response: { code: 'STUDY_PROGRESS_LIMIT_REACHED' },
    });
    // Existing subjects still report stale revision, rather than the quota.
    await expect(service.save(userId, subjects[0], 0, planFor(subjects[0])))
      .rejects.toMatchObject({
        response: { code: 'STUDY_PROGRESS_REVISION_CONFLICT' },
      });
    await service.remove(userId, subjects[0], 1);
    await expect(service.save(userId, extra, 0, planFor(extra)))
      .resolves.toMatchObject({ progress: { revision: 1 } });
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
      cursor: null, limit: 100,
    });
    expect(rows.items).toHaveLength(1);
    expect(rows.items[0]?.subjectId).toBe(subjectId);
    expect(rows.items[0]?.plan.subjectId).toBe(subjectId);
    expect(rows.nextCursor).toBeNull();
    expect(Object.keys(rows.items[0] ?? {}).sort()).toEqual([
      'createdAt', 'plan', 'revision', 'subjectId', 'updatedAt',
    ]);
    const result = await lifecycle.closeAccount({
      userId: ownerId, expectedCredentialVersion: 1,
      now: new Date(), cleanupJobId: randomUUID(), auditId: randomUUID(),
    });
    expect(result.status).toBe('closed');
    expect(await exportReader.hasOwnedProgress(ownerId)).toBe(false);
    expect((await exportReader.listAccountExportProgress(ownerId, {
      cursor: null, limit: 100,
    })).items).toHaveLength(0);
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
              readPage: async () => ({
                records: [], nextCursor: null,
              }),
            },
      );
    const chunks: string[] = [];
    const commit = jest.fn().mockResolvedValue(undefined);
    const sink: AccountExportArtifactSink = {
      write: async (chunk) => { chunks.push(chunk); },
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
      assertActiveAccount: async (ownerUserId: string) => {
        if (ownerUserId !== userId) {
          throw new Error('Unexpected account authority');
        }
      },
      captureStudyProgressExportEpoch: (ownerUserId: string) =>
        userReader.getStudyProgressExportEpoch(ownerUserId),
      assertStudyProgressExportEpoch: async (
        ownerUserId: string, expected: number,
      ) => {
        const actual = await userReader.getStudyProgressExportEpoch(ownerUserId);
        if (actual !== expected) {
          throw new Error('Study progress changed during account export');
        }
      },
    } as unknown as AccountExportService;
    const assembler = new AccountExportAssembler(
      new AccountExportContributorRegistry(contributors), exportService,
    );
    const result = await assembler.writeJsonV3(userId, sink);
    const bytes = chunks.join('');
    const artifact = JSON.parse(bytes) as {
      version: number;
      sections: Record<string, Array<Record<string, unknown>>>;
    };
    expect(artifact.version).toBe(3);
    expect(Object.keys(artifact.sections)).toEqual(ACCOUNT_EXPORT_V3_SECTION_IDS);
    expect(artifact.sections['study.progress']).toHaveLength(1);
    expect(artifact.sections['study.progress'][0]?.subjectId).toBe(subjectId);
    expect(artifact.sections['study.progress'][0]?.revision).toBe(1);
    expect(bytes).not.toContain(otherSubject);
    expect(bytes).not.toContain(foreignId);
    expect(result.sectionCount).toBe(32);
    expect(result.recordCount).toBe(1);
    expect(result.byteLength).toBe(Buffer.byteLength(bytes, 'utf8'));
    expect(result.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
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
        sectionId === 'study.progress' ? source : {
          sectionId, readPage: async () => ({ records: [], nextCursor: null }),
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
            ...planFor(subjectId), title: 'Actualización concurrente',
          });
        }
      },
      commit, abort,
    };
    const exportApi = {
      captureStudyProgressExportEpoch: (ownerUserId: string) =>
        account.getStudyProgressExportEpoch(ownerUserId),
      assertStudyProgressExportEpoch: async (
        ownerUserId: string, expected: number,
      ) => {
        const actual = await account.getStudyProgressExportEpoch(ownerUserId);
        if (actual !== expected) {
          throw new Error('Study progress changed during account export');
        }
      },
      assertActiveAccount: async (ownerUserId: string) => {
        if (ownerUserId !== userId) throw new Error('Wrong owner');
      },
      readContributorPage: (
        contributor: AccountExportContributor,
        ownerUserId: string, cursor: string | null,
      ) => contributor.readPage({ userId: ownerUserId, cursor, limit: 100 }),
    } as unknown as AccountExportService;
    const assembler = new AccountExportAssembler(
      new AccountExportContributorRegistry(contributors), exportApi,
    );
    await expect(assembler.writeJsonV3(userId, sink))
      .rejects.toThrow('Study progress changed during account export');
    expect(mutated).toBe(true);
    expect(await account.getStudyProgressExportEpoch(userId))
      .toBe(originalEpoch + 1);
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
      id, userId: ownerId, state: 'processing', active: true,
      formatVersion: 3, attempts: 1, nextAttemptAt: startedAt,
      claimId, leaseExpiresAt: new Date(startedAt.getTime() + 120_000),
    });
    const store = new MongoAccountExportStore(exportJobs, users, connection);
    const result = await store.complete({
      id, claimId, ownerUserId: ownerId, expectedProgressEpoch: original,
      completedAt: new Date(), artifactGeneration: claimId,
      artifactExpiresAt: new Date(Date.now() + 86_400_000),
      result: {
        format: 'los-apuntes-account-export', formatVersion: 3,
        sectionCount: 32, recordCount: 1, byteLength: 128,
        sha256: 'a'.repeat(64),
      },
    });
    expect(result).toBe(true);
    const committed = await exportJobs.findOne({ id }).lean().exec();
    expect(committed?.state).toBe('completed');
    expect(committed?.artifactGeneration).toBe(claimId);
    expect(await account.getStudyProgressExportEpoch(ownerId))
      .toBe(original + 1);
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
      id, userId: ownerId, state: 'processing', active: true,
      formatVersion: 3, attempts: 1, nextAttemptAt: new Date(),
      claimId, leaseExpiresAt: new Date(Date.now() + 120_000),
    });
    await service.save(ownerId, subjectId, 1, {
      ...planFor(subjectId), title: 'Actualización concurrente',
    });
    const store = new MongoAccountExportStore(exportJobs, users, connection);
    const finish = (expectedProgressEpoch: number) => store.complete({
      id, claimId, ownerUserId: ownerId, expectedProgressEpoch,
      completedAt: new Date(), artifactGeneration: claimId,
      artifactExpiresAt: new Date(Date.now() + 86_400_000),
      result: {
        format: 'los-apuntes-account-export', formatVersion: 3,
        sectionCount: 32, recordCount: 1, byteLength: 128,
        sha256: 'a'.repeat(64),
      },
    });
    await expect(finish(staleEpoch))
      .rejects.toThrow('Study progress changed during account export');
    expect((await exportJobs.findOne({ id }).lean().exec())?.state)
      .toBe('processing');
    expect(await account.getStudyProgressExportEpoch(ownerId))
      .toBe(staleEpoch + 1);
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
      id, userId: ownerA, state: 'processing', active: true,
      formatVersion: 3, attempts: 1, nextAttemptAt: new Date(),
      claimId, leaseExpiresAt: new Date(Date.now() + 120_000),
    });
    const store = new MongoAccountExportStore(exportJobs, users, connection);
    await expect(store.complete({
      id, claimId, ownerUserId: ownerB, expectedProgressEpoch: epochB,
      completedAt: new Date(), artifactGeneration: claimId,
      artifactExpiresAt: new Date(Date.now() + 86_400_000),
      result: {
        format: 'los-apuntes-account-export', formatVersion: 3,
        sectionCount: 32, recordCount: 0, byteLength: 128,
        sha256: 'a'.repeat(64),
      },
    })).resolves.toBe(false);
    expect((await exportJobs.findOne({ id }).lean().exec())?.state)
      .toBe('processing');
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
      id, userId: ownerId, state: 'processing', active: true,
      formatVersion: 3, attempts: 1, nextAttemptAt: expired,
      claimId, leaseExpiresAt: expired,
    });
    const store = new MongoAccountExportStore(exportJobs, users, connection);
    await expect(store.complete({
      id, claimId, ownerUserId: ownerId, expectedProgressEpoch: epoch,
      completedAt: new Date(), artifactGeneration: claimId,
      artifactExpiresAt: new Date(Date.now() + 86_400_000),
      result: {
        format: 'los-apuntes-account-export', formatVersion: 3,
        sectionCount: 32, recordCount: 0, byteLength: 128,
        sha256: 'a'.repeat(64),
      },
    })).resolves.toBe(false);
    expect(await account.getStudyProgressExportEpoch(ownerId)).toBe(epoch);
    expect((await exportJobs.findOne({ id }).lean().exec())?.state)
      .toBe('processing');
  }, 30_000);

  it('B66 recovers an actually committed Mongo export after its response is lost', async () => {
    const userId = await owner();
    const subjectId = randomUUID();
    await service.save(userId, subjectId, 0, planFor(subjectId));
    const id = randomUUID();
    const claimId = randomUUID();
    const created = new Date();
    await exportJobs.create({
      id, userId, state: 'processing', active: true,
      formatVersion: 3, attempts: 1, nextAttemptAt: created,
      claimId, leaseExpiresAt: new Date(created.getTime() + 120_000),
    });
    const store = new MongoAccountExportStore(exportJobs, users, connection);
    const job = await store.findOwned(id, userId) as AccountExportJobRecord;
    const userReader = new UsersService(users as never);
    const assembly = {
      format: 'los-apuntes-account-export' as const,
      formatVersion: 3 as const,
      sectionCount: 32, recordCount: 1, byteLength: 256,
      sha256: 'a'.repeat(64),
    };
    let s3Committed = false;
    const deleteArtifact = jest.fn().mockResolvedValue(undefined);
    const artifacts = {
      createSink: jest.fn().mockReturnValue({
        write: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockImplementation(async () => { s3Committed = true; }),
        abort: jest.fn().mockResolvedValue(undefined),
      }),
      deleteArtifact,
    } as unknown as AccountExportArtifactStorage;
    const assembler = {
      writeJsonV3: async (_owner: string, sink: AccountExportArtifactSink) => {
        // The artifact sink is a test double; Mongo commit and lookup are real.
        await sink.write('private-v3');
        await sink.commit(assembly);
        return assembly;
      },
    } as unknown as AccountExportAssembler;
    const complete = jest.fn(async (input: {
      id: string; claimId: string; ownerUserId: string;
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
    });
    const reschedule = jest.fn();
    const workerService = {
      claimNext: jest.fn().mockResolvedValueOnce(job),
      captureStudyProgressExportEpoch: (ownerId: string) =>
        userReader.getStudyProgressExportEpoch(ownerId),
      assertStudyProgressExportEpoch: async (
        ownerId: string, expected: number,
      ) => {
        expect(await userReader.getStudyProgressExportEpoch(ownerId))
          .toBe(expected);
      },
      complete, reschedule,
      renewLease: jest.fn().mockResolvedValue(true),
    } as unknown as AccountExportService;
    const processor = new AccountExportProcessor(
      workerService, assembler, store, artifacts,
      {
        enqueue: jest.fn(), claimNext: jest.fn().mockResolvedValue(null),
        acknowledge: jest.fn(), retry: jest.fn(),
      } as unknown as AccountExportOrphanCleanupStore,
    );
    await expect(processor.runIteration()).resolves.toMatchObject({
      claimed: 1, completed: 1, stale: 0, retryScheduled: 0,
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

  it('B66 deletes an orphan only after a real Mongo reschedule commits', async () => {
    const userId = await owner();
    const id = randomUUID();
    const claimId = randomUUID();
    const created = new Date();
    await exportJobs.create({
      id, userId, state: 'processing', active: true,
      formatVersion: 3, attempts: 1, nextAttemptAt: created,
      claimId, leaseExpiresAt: new Date(created.getTime() + 120_000),
    });
    const store = new MongoAccountExportStore(exportJobs, users, connection);
    const job = await store.findOwned(id, userId) as AccountExportJobRecord;
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
      sectionCount: 32, recordCount: 0, byteLength: 128,
      sha256: 'a'.repeat(64),
    };
    const workerService = {
      claimNext: jest.fn().mockResolvedValueOnce(job),
      renewLease: jest.fn().mockResolvedValue(true),
      captureStudyProgressExportEpoch: (ownerId: string) =>
        reader.getStudyProgressExportEpoch(ownerId),
      assertStudyProgressExportEpoch: async () => undefined,
      complete: jest.fn().mockRejectedValue(new Error('Mongo reply unknown')),
      reschedule: async (input: {
        id: string; claimId: string; state: 'pending' | 'failed';
        nextAttemptAt: Date; failureCode: 'EXPORT_ASSEMBLY_RETRY';
      }) => {
        const updated = await store.reschedule({ ...input, now: new Date() });
        if (updated) operations.push('reschedule-committed');
        return updated;
      },
    } as unknown as AccountExportService;
    const assembler = {
      writeJsonV3: async (_owner: string, sink: AccountExportArtifactSink) => {
        await sink.write('orphaned-v3');
        await sink.commit(assembly);
        return assembly;
      },
    } as unknown as AccountExportAssembler;
    const processor = new AccountExportProcessor(
      workerService, assembler, store, artifacts,
      {
        enqueue: jest.fn(), claimNext: jest.fn().mockResolvedValue(null),
        acknowledge: jest.fn(), retry: jest.fn(),
      } as unknown as AccountExportOrphanCleanupStore,
    );
    await expect(processor.runIteration()).resolves.toMatchObject({
      claimed: 1, retryScheduled: 1, completed: 0,
    });
    expect(operations).toEqual(['reschedule-committed', 'delete-S3']);
    expect(deleteArtifact).toHaveBeenCalledWith(id, claimId);
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
      jobId: id, ownerUserId: ownerId, generation, now,
    });
    await store.enqueue({
      jobId: id, ownerUserId: ownerId, generation, now,
    });
    expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(1);
    const firstClaim = randomUUID();
    const leased = await store.claimNext({
      now, claimId: firstClaim,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    });
    expect(leased).toMatchObject({ jobId: id, generation, attempts: 1 });
    // Lost process: Mongo retains the attempt. It is not claimable early.
    await expect(store.claimNext({
      now, claimId: randomUUID(),
      leaseExpiresAt: new Date(now.getTime() + 120_000),
    })).resolves.toBeNull();
    const secondClaim = randomUUID();
    const later = new Date(now.getTime() + 60_001);
    const reclaimed = await store.claimNext({
      now: later, claimId: secondClaim,
      leaseExpiresAt: new Date(later.getTime() + 120_000),
    });
    expect(reclaimed).toMatchObject({ claimId: secondClaim, attempts: 2 });
    await expect(store.acknowledge({
      jobId: id, generation, claimId: firstClaim, now: later,
    })).resolves.toBe(false);
    await expect(store.acknowledge({
      jobId: id, generation, claimId: secondClaim, now: later,
    })).resolves.toBe(true);
    expect(await orphanJobs.countDocuments({ jobId: id, generation })).toBe(0);
  }, 30_000);

  it('B67 retries a failed deletion without losing a durable orphan record', async () => {
    const ownerId = await owner();
    const id = randomUUID();
    const generation = randomUUID();
    const store = new MongoAccountExportOrphanCleanupStore(orphanJobs);
    const now = new Date();
    await store.enqueue({ jobId: id, ownerUserId: ownerId, generation, now });
    const first = await store.claimNext({
      now, claimId: randomUUID(),
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    });
    expect(first).not.toBeNull();
    const future = new Date(now.getTime() + 30_000);
    await expect(store.retry({
      jobId: id, generation, claimId: first!.claimId,
      now, nextAttemptAt: future,
    })).resolves.toBe(true);
    const persisted = await orphanJobs.findOne({ jobId: id, generation }).lean().exec();
    expect(persisted).toMatchObject({ state: 'pending', attempts: 1 });
    await expect(store.claimNext({
      now, claimId: randomUUID(),
      leaseExpiresAt: new Date(now.getTime() + 120_000),
    })).resolves.toBeNull();
    const second = await store.claimNext({
      now: future, claimId: randomUUID(),
      leaseExpiresAt: new Date(future.getTime() + 120_000),
    });
    expect(second).toMatchObject({ attempts: 2 });
  }, 30_000);

  it('purges progress in account closure transaction and blocks later mutations', async () => {
    const userId = await owner();
    const subjectId = randomUUID();
    await service.save(userId, subjectId, 0, planFor(subjectId));
    const closure = await lifecycle.closeAccount({
      userId, expectedCredentialVersion: 1,
      now: new Date(), cleanupJobId: randomUUID(), auditId: randomUUID(),
    });
    expect(closure.status).toBe('closed');
    expect(await progress.countDocuments({ ownerUserId: userId })).toBe(0);
    await expect(service.save(userId, subjectId, 0, planFor(subjectId)))
      .rejects.toMatchObject({ response: { code: 'STUDY_PROGRESS_ACCOUNT_INACTIVE' } });
  }, 30_000);
});
