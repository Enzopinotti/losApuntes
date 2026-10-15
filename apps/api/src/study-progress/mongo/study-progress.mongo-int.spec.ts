import { randomUUID } from 'node:crypto';
import { createConnection, type Connection, type Model } from 'mongoose';

import { MongoAccountLifecycleStore } from '../../data-lifecycle/mongo/mongo-account-lifecycle.store';
import {
  AccountOffboardingJob, AccountOffboardingJobSchema,
  SecurityAudit, SecurityAuditSchema,
} from '../../data-lifecycle/mongo/data-lifecycle.mongo-schemas';
import { OrganizationManager, OrganizationManagerSchema } from '../../organizations/mongo/organization.mongo-schemas';
import { Profile, ProfileSchema } from '../../profile/mongo/profile.mongo-schemas';
import { StudyCollection, StudyCollectionSchema } from '../../study-collections/mongo/study-collection.mongo-schema';
import { User, UserSchema } from '../../users/schemas/user.schema';
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
    await Promise.all([users, progress, profiles, managers, jobs, audits, collections]
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
