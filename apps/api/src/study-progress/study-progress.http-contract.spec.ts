import {
  ConflictException,
  NotFoundException,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';

import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { AuthSessionService } from '../auth/session/auth-session.service';
import { createSessionToken } from '../auth/session/session-token';
import { UsersService } from '../users/users.service';
import {
  configureHttpRuntime,
  createHttpAdapter,
} from '../runtime/http-runtime';
import { StudyProgressController } from './study-progress.controller';
import { StudyProgressFeatureGuard } from './study-progress.feature.guard';
import { StudyProgressService } from './study-progress.service';

const subjectId = '11111111-1111-4111-8111-111111111111';
const tokenA = createSessionToken();
const tokenB = createSessionToken();
const ownerA = 'owner-a';
const ownerB = 'owner-b';
const validPlan = {
  format: 'losapuntes.study-session',
  version: 1,
  subjectId,
  title: 'Plan privado',
  notes: '',
  startsAt: null,
  tasks: [],
};

describe('B217 real Nest/Fastify Study Progress HTTP security contract', () => {
  let app: INestApplication;
  let enabled = false;
  const sessions = {
    resolve: jest.fn(),
    revokeCurrent: jest.fn().mockResolvedValue(undefined),
  };
  const users = { findById: jest.fn() };
  const study = {
    get: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const session = (userId: string, clientType: 'web' | 'mobile') => ({
    userId,
    credentialVersion: 1,
    session: {
      id: randomUUID(),
      clientType,
      createdAt: '2026-10-01T00:00:00.000Z',
      lastSeenAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2026-11-01T00:00:00.000Z',
      current: true,
    },
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StudyProgressController],
      providers: [
        AuthSessionGuard,
        StudyProgressFeatureGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'STUDY_PROGRESS_ENABLED') return enabled;
              if (key === 'NODE_ENV') return 'test';
              return undefined;
            },
          },
        },
        { provide: AuthSessionService, useValue: sessions },
        { provide: UsersService, useValue: users },
        { provide: StudyProgressService, useValue: study },
      ],
    }).compile();

    const fastifyApp = module.createNestApplication<NestFastifyApplication>(
      createHttpAdapter({ logger: false }),
    );
    // The production cookie plugin dynamically imports under Fastify. Model
    // only its decoded request field in this isolated Jest adapter so this
    // suite also works when run by all canonical coverage jobs, without VM
    // module flags or changing the actual AuthSessionGuard.
    fastifyApp.getHttpAdapter().getInstance().addHook(
      'onRequest',
      (request, _reply, done) => {
        const raw = request.headers.cookie ?? '';
        const match = /^losapuntes_session=([A-Za-z0-9_-]{43})$/u.exec(raw);
        request.cookies = match ? { losapuntes_session: match[1] } : {};
        done();
      },
    );
    configureHttpRuntime(fastifyApp, module.get(ConfigService));
    await fastifyApp.init();
    await fastifyApp.getHttpAdapter().getInstance().ready();
    app = fastifyApp;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    enabled = false;
    jest.clearAllMocks();
    sessions.resolve.mockImplementation((token: string, client: string) => {
      if (client !== 'mobile' && client !== 'web') return Promise.resolve(null);
      if (token === tokenA) return Promise.resolve(session(ownerA, client));
      if (token === tokenB) return Promise.resolve(session(ownerB, client));
      return Promise.resolve(null);
    });
    users.findById.mockImplementation((userId: string) =>
      Promise.resolve({
        _id: { toString: () => userId },
        email: userId + '@example.invalid',
        credential_version: 1,
        account_status: 'active',
      }),
    );
    study.get.mockImplementation((userId: string) =>
      Promise.resolve({
        progress: {
          plan: { ...validPlan, title: 'Privado de ' + userId },
          revision: 1,
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      }),
    );
    study.save.mockResolvedValue({
      progress: {
        plan: validPlan,
        revision: 1,
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    });
    study.remove.mockResolvedValue({ deleted: true });
  });

  const call = (options: {
    method: 'GET' | 'PUT' | 'DELETE';
    token?: string;
    cookie?: boolean;
    authHeader?: string;
    path?: string;
    payload?: Record<string, unknown>;
  }) => {
    const headers: Record<string, string> = {};
    if (options.token) {
      if (options.cookie)
        headers.cookie = 'losapuntes_session=' + options.token;
      else headers.authorization = 'Bearer ' + options.token;
    }
    if (options.authHeader) headers.authorization = options.authHeader;
    return (app as NestFastifyApplication)
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: options.method,
        url: options.path ?? '/study-progress/' + subjectId,
        headers,
        ...(options.payload ? { payload: options.payload } : {}),
      });
  };

  it('fails closed at HTTP boundary by default for authenticated GET/PUT/DELETE', async () => {
    for (const method of ['GET', 'PUT', 'DELETE'] as const) {
      const result = await call({
        method,
        token: tokenA,
        ...(method === 'PUT'
          ? { payload: { expectedRevision: 0, plan: validPlan } }
          : {}),
        ...(method === 'DELETE' ? { payload: { expectedRevision: 1 } } : {}),
      });
      expect(result.statusCode).toBe(503);
      expect(result.headers['cache-control']).toBe('private, no-store');
      // 5xx details are deliberately sanitized by the actual API filter.
      expect(result.json()).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
    expect(study.get).not.toHaveBeenCalled();
    expect(study.save).not.toHaveBeenCalled();
    expect(study.remove).not.toHaveBeenCalled();
  });

  it('rejects missing, malformed, expired and ambiguous credentials before persistence', async () => {
    enabled = true;
    for (const input of [
      {},
      { authHeader: 'Bearer invalid' },
      { token: createSessionToken() },
      { token: tokenA, cookie: true, authHeader: 'Bearer ' + tokenB },
    ]) {
      const result = await call({ method: 'GET', ...input });
      expect(result.statusCode).toBe(401);
      expect(result.json()).toMatchObject({
        code: 'AUTHENTICATION_REQUIRED',
      });
    }
    expect(study.get).not.toHaveBeenCalled();
  });

  it('enforces account restriction and credential-revocation fences', async () => {
    enabled = true;
    users.findById.mockResolvedValueOnce({
      _id: { toString: () => ownerA },
      email: 'restricted@example.invalid',
      credential_version: 1,
      account_status: 'restricted',
    });
    const restricted = await call({ method: 'GET', token: tokenA });
    expect(restricted.statusCode).toBe(403);
    expect(restricted.json()).toMatchObject({
      code: 'ACCOUNT_RESTRICTED',
    });
    expect(sessions.revokeCurrent).toHaveBeenCalledWith(tokenA);

    sessions.resolve.mockResolvedValueOnce({
      ...session(ownerA, 'mobile'),
      credentialVersion: 9,
    });
    const rotated = await call({ method: 'GET', token: tokenA });
    expect(rotated.statusCode).toBe(401);
    expect(sessions.revokeCurrent).toHaveBeenCalledWith(tokenA);
    expect(study.get).not.toHaveBeenCalled();
  });

  it('derives owner only from independent authenticated mobile sessions', async () => {
    enabled = true;
    const [first, second] = await Promise.all([
      call({ method: 'GET', token: tokenA }),
      call({ method: 'GET', token: tokenB }),
    ]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      progress: { plan: { title: 'Privado de ' + ownerA } },
    });
    expect(second.json()).toMatchObject({
      progress: { plan: { title: 'Privado de ' + ownerB } },
    });
    expect(study.get).toHaveBeenCalledWith(ownerA, subjectId);
    expect(study.get).toHaveBeenCalledWith(ownerB, subjectId);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(second.headers['cache-control']).toBe('private, no-store');
  });

  it('accepts authenticated Web cookie only as the Web session transport', async () => {
    enabled = true;
    const answer = await call({ method: 'GET', token: tokenB, cookie: true });
    expect(answer.statusCode).toBe(200);
    expect(sessions.resolve).toHaveBeenCalledWith(tokenB, 'web');
    expect(study.get).toHaveBeenCalledWith(ownerB, subjectId);
  });

  it('blocks forged owner fields and invalid revision DTOs at the wire boundary', async () => {
    enabled = true;
    for (const payload of [
      { expectedRevision: 0, plan: validPlan, ownerUserId: ownerB },
      { expectedRevision: -1, plan: validPlan },
      { expectedRevision: '0', plan: validPlan },
      { expectedRevision: 0, plan: null },
    ]) {
      const response = await call({ method: 'PUT', token: tokenA, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'BAD_REQUEST' });
    }
    for (const payload of [
      { expectedRevision: 0 },
      { expectedRevision: 1, ownerUserId: ownerB },
    ]) {
      const response = await call({ method: 'DELETE', token: tokenA, payload });
      expect(response.statusCode).toBe(400);
    }
    expect(study.save).not.toHaveBeenCalled();
    expect(study.remove).not.toHaveBeenCalled();
  });

  it('routes legitimate saves and deletes to the authenticated account only', async () => {
    enabled = true;
    const saved = await call({
      method: 'PUT',
      token: tokenA,
      payload: { expectedRevision: 0, plan: validPlan },
    });
    expect(saved.statusCode).toBe(200);
    expect(study.save).toHaveBeenCalledWith(ownerA, subjectId, 0, validPlan);
    const removed = await call({
      method: 'DELETE',
      token: tokenB,
      payload: { expectedRevision: 1 },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({ deleted: true });
    expect(study.remove).toHaveBeenCalledWith(ownerB, subjectId, 1);
  });

  it('preserves private 404 and 409 responses without cross-owner data', async () => {
    enabled = true;
    study.get.mockRejectedValueOnce(
      new NotFoundException({
        code: 'STUDY_PROGRESS_NOT_FOUND',
        message: 'No saved progress for this subject',
      }),
    );
    const missing = await call({ method: 'GET', token: tokenB });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      code: 'STUDY_PROGRESS_NOT_FOUND',
    });

    study.save.mockRejectedValueOnce(
      new ConflictException({
        code: 'STUDY_PROGRESS_REVISION_CONFLICT',
        message: 'Progress was updated in another session.',
      }),
    );
    const conflict = await call({
      method: 'PUT',
      token: tokenA,
      payload: { expectedRevision: 1, plan: validPlan },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      code: 'STUDY_PROGRESS_REVISION_CONFLICT',
    });
    expect(JSON.stringify(conflict.json())).not.toContain(ownerB);
  });
});
