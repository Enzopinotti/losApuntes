import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AcademicStore } from './academic.store';
import type { AcademicService } from './academic.service';
import { AcademicLifecycleService } from './academic-lifecycle.service';
import type {
  AcademicAffiliationRecord,
  AcademicFollowRecord,
  SubjectParticipationRecord,
} from './academic.types';

const now = new Date('2026-09-24T12:00:00.000Z');

function affiliation(
  overrides: Partial<AcademicAffiliationRecord> = {},
): AcademicAffiliationRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-1',
    institutionId: '22222222-2222-4222-8222-222222222222',
    programId: '33333333-3333-4333-8333-333333333333',
    status: 'active',
    roles: ['student'],
    startedOn: '2022-03',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function participation(
  overrides: Partial<SubjectParticipationRecord> = {},
): SubjectParticipationRecord {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    userId: 'user-1',
    subjectId: '55555555-5555-4555-8555-555555555555',
    state: 'current',
    periodLabel: '2026 S2',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function follow(
  overrides: Partial<AcademicFollowRecord> = {},
): AcademicFollowRecord {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    userId: 'user-1',
    targetNodeId: '22222222-2222-4222-8222-222222222222',
    targetKind: 'institution',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function store(): jest.Mocked<AcademicStore> {
  const value = {
    runAtomically: jest.fn(async <T>(operation: () => Promise<T>) =>
      operation(),
    ),
    findAffiliationById: jest.fn(),
    listAffiliationsForUser: jest.fn().mockResolvedValue([]),
    listSubjectParticipationsForUser: jest.fn().mockResolvedValue([]),
    getCurrentContext: jest.fn().mockResolvedValue(null),
    setCurrentContext: jest.fn(),
    transitionAffiliationToAlumni: jest.fn(),
    transitionSubjectParticipationStates: jest.fn().mockResolvedValue(0),
    updateAffiliationRoles: jest.fn(),
    upsertAcademicFollow: jest.fn(),
    listAcademicFollows: jest.fn().mockResolvedValue([]),
    removeAcademicFollows: jest.fn(),
    appendAuditEvent: jest.fn().mockResolvedValue(undefined),
  };

  return value as unknown as jest.Mocked<AcademicStore>;
}

function academic(): jest.Mocked<AcademicService> {
  const value = {
    projectAffiliationRecord: jest.fn((row: AcademicAffiliationRecord) =>
      Promise.resolve({
        id: row.id,
        status: row.status,
        roles: row.roles ?? [],
        institutionId: row.institutionId,
        programId: row.programId,
        startedOn: row.startedOn,
        endedOn: row.endedOn,
      }),
    ),
    participationBelongsToAffiliation: jest.fn().mockResolvedValue(false),
    resolveContinuityFollowTarget: jest.fn(),
  };

  return value as unknown as jest.Mocked<AcademicService>;
}

describe('AcademicLifecycleService', () => {
  it.each([
    {
      label: 'student',
      affiliations: [affiliation()],
      expected: 'student',
    },
    {
      label: 'alumni',
      affiliations: [
        affiliation({
          status: 'alumni',
          roles: ['alumni'],
          endedOn: '2026-09',
        }),
      ],
      expected: 'alumni',
    },
    {
      label: 'mixed',
      affiliations: [
        affiliation(),
        affiliation({
          id: '77777777-7777-4777-8777-777777777777',
          status: 'completed',
          roles: ['recent_graduate'],
        }),
      ],
      expected: 'mixed',
    },
    {
      label: 'community',
      affiliations: [],
      expected: 'community',
    },
  ])(
    'derives $label lifecycle phase without persisted flags',
    async ({ affiliations, expected }) => {
      const lifecycleStore = store();
      const academicService = academic();
      lifecycleStore.listAffiliationsForUser.mockResolvedValue(affiliations);
      lifecycleStore.listSubjectParticipationsForUser.mockResolvedValue([
        participation(),
        participation({
          id: '88888888-8888-4888-8888-888888888888',
          subjectId: '99999999-9999-4999-8999-999999999999',
          state: 'completed',
        }),
      ]);
      lifecycleStore.getCurrentContext.mockResolvedValue({
        userId: 'user-1',
        affiliationId: affiliations[0]?.id ?? 'none',
        subjectParticipationId:
          expected === 'student' || expected === 'mixed'
            ? '44444444-4444-4444-8444-444444444444'
            : undefined,
        createdAt: now,
        updatedAt: now,
      });

      const result = await new AcademicLifecycleService(
        lifecycleStore,
        academicService,
      ).getLifecycle('user-1');

      expect(result.phase).toBe(expected);
      expect(result.currentSubjectIds).toEqual([
        '55555555-5555-4555-8555-555555555555',
      ]);
      expect(result.hasCurrentSubjectContext).toBe(
        expected === 'student' || expected === 'mixed',
      );
    },
  );

  it('graduates atomically, completes scoped current subjects and clears subject context', async () => {
    const lifecycleStore = store();
    const academicService = academic();
    const active = affiliation({
      roles: ['advanced_student', 'mentor'],
    });
    const graduated = affiliation({
      status: 'alumni',
      roles: ['mentor', 'recent_graduate', 'alumni'],
      endedOn: '2026-09',
    });
    const scoped = participation();
    const outside = participation({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });

    lifecycleStore.findAffiliationById.mockResolvedValue(active);
    lifecycleStore.listSubjectParticipationsForUser
      .mockResolvedValueOnce([scoped, outside])
      .mockResolvedValueOnce([{ ...scoped, state: 'completed' }, outside]);
    academicService.participationBelongsToAffiliation
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    lifecycleStore.transitionAffiliationToAlumni.mockResolvedValue(graduated);
    lifecycleStore.transitionSubjectParticipationStates.mockResolvedValue(1);
    lifecycleStore.getCurrentContext
      .mockResolvedValueOnce({
        userId: 'user-1',
        affiliationId: active.id,
        subjectParticipationId: scoped.id,
        createdAt: now,
        updatedAt: now,
      })
      .mockResolvedValueOnce({
        userId: 'user-1',
        affiliationId: active.id,
        createdAt: now,
        updatedAt: now,
      });
    lifecycleStore.setCurrentContext.mockResolvedValue({
      userId: 'user-1',
      affiliationId: active.id,
      createdAt: now,
      updatedAt: now,
    });
    lifecycleStore.listAffiliationsForUser.mockResolvedValue([graduated]);

    const result = await new AcademicLifecycleService(
      lifecycleStore,
      academicService,
    ).graduate('user-1', active.id, { graduatedOn: '2026-09' });

    expect(result.transitionedSubjectCount).toBe(1);
    expect(result.affiliation).toEqual(
      expect.objectContaining({
        id: active.id,
        status: 'alumni',
        roles: ['mentor', 'recent_graduate', 'alumni'],
      }),
    );
    expect(
      lifecycleStore.transitionSubjectParticipationStates.mock.calls,
    ).toContainEqual(['user-1', [scoped.id], 'current', 'completed']);
    expect(lifecycleStore.setCurrentContext.mock.calls).toContainEqual([
      {
        userId: 'user-1',
        affiliationId: active.id,
      },
    ]);
    expect(lifecycleStore.appendAuditEvent.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        event: 'academic.affiliation.graduated',
        actorUserId: 'user-1',
        targetId: active.id,
        metadata: {
          graduatedOn: '2026-09',
          transitionedSubjectCount: 1,
        },
      }),
    );
    expect(result.lifecycle.phase).toBe('alumni');
  });

  it('does not clear context when graduating affiliation has no current subject context', async () => {
    const lifecycleStore = store();
    const academicService = academic();
    const active = affiliation();
    const graduated = affiliation({
      status: 'alumni',
      roles: ['recent_graduate', 'alumni'],
      endedOn: '2026-09',
    });

    lifecycleStore.findAffiliationById.mockResolvedValue(active);
    lifecycleStore.listSubjectParticipationsForUser.mockResolvedValue([]);
    lifecycleStore.transitionAffiliationToAlumni.mockResolvedValue(graduated);
    lifecycleStore.getCurrentContext.mockResolvedValue({
      userId: 'user-1',
      affiliationId: active.id,
      createdAt: now,
      updatedAt: now,
    });
    lifecycleStore.listAffiliationsForUser.mockResolvedValue([graduated]);

    await new AcademicLifecycleService(
      lifecycleStore,
      academicService,
    ).graduate('user-1', active.id, { graduatedOn: '2026-09' });

    expect(lifecycleStore.setCurrentContext.mock.calls).toHaveLength(0);
  });

  it.each(['applicant', 'withdrawn'] as const)(
    'rejects graduation from %s affiliation',
    async (status) => {
      const lifecycleStore = store();
      lifecycleStore.findAffiliationById.mockResolvedValue(
        affiliation({ status, roles: [] }),
      );

      await expect(
        new AcademicLifecycleService(lifecycleStore, academic()).graduate(
          'user-1',
          '11111111-1111-4111-8111-111111111111',
          { graduatedOn: '2026-09' },
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    },
  );

  it('is idempotent after affiliation already became alumni', async () => {
    const lifecycleStore = store();
    const academicService = academic();
    const alumni = affiliation({
      status: 'alumni',
      roles: ['alumni'],
      endedOn: '2026-09',
    });
    lifecycleStore.findAffiliationById.mockResolvedValue(alumni);
    lifecycleStore.listAffiliationsForUser.mockResolvedValue([alumni]);

    const result = await new AcademicLifecycleService(
      lifecycleStore,
      academicService,
    ).graduate('user-1', alumni.id, { graduatedOn: '2026-09' });

    expect(result.transitionedSubjectCount).toBe(0);
    expect(
      lifecycleStore.transitionAffiliationToAlumni.mock.calls,
    ).toHaveLength(0);
    expect(lifecycleStore.appendAuditEvent.mock.calls).toHaveLength(0);
  });

  it('accepts a concurrent successful graduation as idempotent', async () => {
    const lifecycleStore = store();
    const academicService = academic();
    const active = affiliation();
    const alumni = affiliation({
      status: 'alumni',
      roles: ['recent_graduate', 'alumni'],
      endedOn: '2026-09',
    });

    lifecycleStore.findAffiliationById
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(alumni);
    lifecycleStore.transitionAffiliationToAlumni.mockResolvedValue(null);
    lifecycleStore.listSubjectParticipationsForUser.mockResolvedValue([]);
    lifecycleStore.listAffiliationsForUser.mockResolvedValue([alumni]);

    const result = await new AcademicLifecycleService(
      lifecycleStore,
      academicService,
    ).graduate('user-1', active.id, { graduatedOn: '2026-09' });

    expect(result.affiliation).toEqual(
      expect.objectContaining({ status: 'alumni' }),
    );
  });

  it('fails closed when graduation loses a concurrent race to non-alumni state', async () => {
    const lifecycleStore = store();
    const active = affiliation();
    lifecycleStore.findAffiliationById.mockResolvedValue(active);
    lifecycleStore.listSubjectParticipationsForUser.mockResolvedValue([]);
    lifecycleStore.transitionAffiliationToAlumni.mockResolvedValue(null);

    await expect(
      new AcademicLifecycleService(lifecycleStore, academic()).graduate(
        'user-1',
        active.id,
        { graduatedOn: '2026-09' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects cross-user affiliation probes as not found', async () => {
    const lifecycleStore = store();
    lifecycleStore.findAffiliationById.mockResolvedValue(
      affiliation({ userId: 'other-user' }),
    );

    await expect(
      new AcademicLifecycleService(lifecycleStore, academic()).graduate(
        'user-1',
        '11111111-1111-4111-8111-111111111111',
        { graduatedOn: '2026-09' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates compatible multi-role affiliations atomically with audit', async () => {
    const lifecycleStore = store();
    const academicService = academic();
    const existing = affiliation({ roles: ['student'] });
    const updated = affiliation({
      roles: ['advanced_student', 'mentor', 'research'],
    });
    lifecycleStore.findAffiliationById.mockResolvedValue(existing);
    lifecycleStore.updateAffiliationRoles.mockResolvedValue(updated);
    lifecycleStore.listAffiliationsForUser.mockResolvedValue([updated]);

    const result = await new AcademicLifecycleService(
      lifecycleStore,
      academicService,
    ).updateRoles('user-1', existing.id, {
      roles: ['advanced_student', 'mentor', 'research', 'mentor'],
    });

    expect(lifecycleStore.updateAffiliationRoles.mock.calls).toContainEqual([
      'user-1',
      existing.id,
      'active',
      ['advanced_student', 'mentor', 'research'],
    ]);
    expect(lifecycleStore.appendAuditEvent.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        event: 'academic.affiliation.roles_updated',
        metadata: { roleCount: 3 },
      }),
    );
    expect(result.affiliation).toEqual(
      expect.objectContaining({ id: existing.id }),
    );
  });

  it('rejects role sets incompatible with lifecycle status', async () => {
    const lifecycleStore = store();
    lifecycleStore.findAffiliationById.mockResolvedValue(
      affiliation({ status: 'alumni', roles: ['alumni'] }),
    );

    await expect(
      new AcademicLifecycleService(lifecycleStore, academic()).updateRoles(
        'user-1',
        '11111111-1111-4111-8111-111111111111',
        { roles: ['student'] },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('fails closed when the affiliation status changes before a role write', async () => {
    const lifecycleStore = store();
    const existing = affiliation({ status: 'active', roles: ['student'] });
    lifecycleStore.findAffiliationById.mockResolvedValue(existing);
    lifecycleStore.updateAffiliationRoles.mockResolvedValue(null);

    await expect(
      new AcademicLifecycleService(lifecycleStore, academic()).updateRoles(
        'user-1',
        existing.id,
        { roles: ['mentor'] },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(lifecycleStore.updateAffiliationRoles.mock.calls).toContainEqual([
      'user-1',
      existing.id,
      'active',
      ['mentor'],
    ]);
  });

  it('follows and unfollows canonical institution/program identity sets', async () => {
    const lifecycleStore = store();
    const academicService = academic();
    academicService.resolveContinuityFollowTarget.mockResolvedValue({
      targetId: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
      name: 'Universidad Nacional',
      identityIds: [
        '22222222-2222-4222-8222-222222222222',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ],
    });

    const service = new AcademicLifecycleService(
      lifecycleStore,
      academicService,
    );
    const followed = await service.follow(
      'user-1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    await service.unfollow('user-1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    expect(followed).toEqual({
      following: true,
      target: {
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'institution',
        name: 'Universidad Nacional',
      },
    });
    expect(lifecycleStore.upsertAcademicFollow.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        targetNodeId: '22222222-2222-4222-8222-222222222222',
        targetKind: 'institution',
      }),
    );
    expect(lifecycleStore.removeAcademicFollows.mock.calls).toContainEqual([
      'user-1',
      [
        '22222222-2222-4222-8222-222222222222',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ],
    ]);
  });

  it('projects merge-safe follows, deduplicates canonical targets and skips missing targets', async () => {
    const lifecycleStore = store();
    const academicService = academic();
    lifecycleStore.listAcademicFollows.mockResolvedValue([
      follow(),
      follow({
        id: '77777777-7777-4777-8777-777777777777',
        targetNodeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
      follow({
        id: '88888888-8888-4888-8888-888888888888',
        targetNodeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        targetKind: 'program',
      }),
    ]);
    academicService.resolveContinuityFollowTarget
      .mockResolvedValueOnce({
        targetId: '22222222-2222-4222-8222-222222222222',
        kind: 'institution',
        name: 'Universidad',
        identityIds: [],
      })
      .mockResolvedValueOnce({
        targetId: '22222222-2222-4222-8222-222222222222',
        kind: 'institution',
        name: 'Universidad',
        identityIds: [],
      })
      .mockRejectedValueOnce(
        new NotFoundException({
          code: 'ACADEMIC_NOT_FOUND',
          message: 'Academic entity was not found',
        }),
      );

    const result = await new AcademicLifecycleService(
      lifecycleStore,
      academicService,
    ).listFollows('user-1');

    expect(result.follows).toEqual([
      {
        targetId: '22222222-2222-4222-8222-222222222222',
        kind: 'institution',
        name: 'Universidad',
      },
    ]);
  });

  it('skips follows whose canonical target is no longer followable', async () => {
    const lifecycleStore = store();
    const academicService = academic();
    lifecycleStore.listAcademicFollows.mockResolvedValue([
      follow(),
      follow({
        id: '77777777-7777-4777-8777-777777777777',
        targetNodeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    ]);
    academicService.resolveContinuityFollowTarget
      .mockRejectedValueOnce(
        new UnprocessableEntityException({
          code: 'ACADEMIC_FOLLOW_KIND_INVALID',
          message: 'Only Institution or Program can be followed',
        }),
      )
      .mockResolvedValueOnce({
        targetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        kind: 'institution',
        name: 'Universidad vigente',
        identityIds: [],
      });

    const result = await new AcademicLifecycleService(
      lifecycleStore,
      academicService,
    ).listFollows('user-1');

    expect(result.follows).toEqual([
      {
        targetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        kind: 'institution',
        name: 'Universidad vigente',
      },
    ]);
  });

  it('rethrows unexpected follow projection failures', async () => {
    const lifecycleStore = store();
    const academicService = academic();
    lifecycleStore.listAcademicFollows.mockResolvedValue([follow()]);
    academicService.resolveContinuityFollowTarget.mockRejectedValue(
      new Error('catalog unavailable'),
    );

    await expect(
      new AcademicLifecycleService(lifecycleStore, academicService).listFollows(
        'user-1',
      ),
    ).rejects.toThrow('catalog unavailable');
  });

  it('rethrows unrelated validation failures while projecting follows', async () => {
    const lifecycleStore = store();
    const academicService = academic();
    lifecycleStore.listAcademicFollows.mockResolvedValue([follow()]);
    academicService.resolveContinuityFollowTarget.mockRejectedValue(
      new UnprocessableEntityException({
        code: 'ACADEMIC_CONTEXT_MISMATCH',
        message: 'Unexpected validation failure',
      }),
    );

    await expect(
      new AcademicLifecycleService(lifecycleStore, academicService).listFollows(
        'user-1',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
