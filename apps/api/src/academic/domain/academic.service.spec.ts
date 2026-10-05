import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  ACADEMIC_AFFILIATION_DECISION_LIMIT,
  ACADEMIC_AFFILIATION_VISIBLE_LIMIT,
  ACADEMIC_PARTICIPATION_DECISION_LIMIT,
  ACADEMIC_PARTICIPATION_VISIBLE_LIMIT,
  type BoundedAcademicPage,
} from './academic-bounds';
import {
  AcademicSourceIdentityConflictError,
  type AcademicStore,
} from './academic.store';
import {
  ACADEMIC_REDIRECT_IDENTITY_LIMIT,
  AcademicService,
} from './academic.service';
import type {
  AcademicAffiliationRecord,
  AcademicCatalogNodeRecord,
  SubjectParticipationRecord,
} from './academic.types';

const now = new Date('2026-09-22T20:00:00.000Z');

function catalogNode(
  overrides: Partial<AcademicCatalogNodeRecord> = {},
): AcademicCatalogNodeRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'country',
    name: 'Argentina',
    normalizedName: 'argentina',
    aliases: [],
    normalizedAliases: [],
    parentIds: [],
    status: 'active',
    provenance: {
      authorityTier: 'A',
      sourceKey: 'official',
      sourceUrl: 'https://example.test/source',
      externalId: 'AR',
      verifiedAt: now,
    },
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function affiliation(
  overrides: Partial<AcademicAffiliationRecord> = {},
): AcademicAffiliationRecord {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: 'user-1',
    institutionId: '22222222-2222-4222-8222-222222222222',
    programId: '33333333-3333-4333-8333-333333333333',
    curriculumId: '44444444-4444-4444-8444-444444444444',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function participation(
  overrides: Partial<SubjectParticipationRecord> = {},
): SubjectParticipationRecord {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    userId: 'user-1',
    subjectId: '55555555-5555-4555-8555-555555555555',
    state: 'current',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function page<T>(items: T[], hasMore = false): BoundedAcademicPage<T> {
  return { items, hasMore };
}

async function rejectedConflict(
  operation: Promise<unknown>,
): Promise<ConflictException> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof ConflictException) return error;
    throw error;
  }

  throw new Error('Expected operation to reject with ConflictException');
}

async function rejectedUnprocessable(
  operation: Promise<unknown>,
): Promise<UnprocessableEntityException> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof UnprocessableEntityException) return error;
    throw error;
  }

  throw new Error(
    'Expected operation to reject with UnprocessableEntityException',
  );
}

function mockFn<T extends (...args: any[]) => any>() {
  return jest.fn<ReturnType<T>, Parameters<T>>();
}

function createStore() {
  const findDirectRedirectSources =
    mockFn<AcademicStore['findDirectRedirectSources']>();
  findDirectRedirectSources.mockResolvedValue(page([]));

  const findCatalogNodesByIds =
    mockFn<AcademicStore['findCatalogNodesByIds']>();
  findCatalogNodesByIds.mockResolvedValue([]);

  const findCatalogNodeById = mockFn<AcademicStore['findCatalogNodeById']>();
  findCatalogNodeById.mockImplementation(async (id) => {
    const rows = await findCatalogNodesByIds([id]);
    return rows[0] ?? null;
  });

  const bumpCatalogNodeRevision =
    mockFn<AcademicStore['bumpCatalogNodeRevision']>();
  bumpCatalogNodeRevision.mockImplementation(async (id, expectedRevision) => {
    const node = await findCatalogNodeById(id);
    if (!node || node.revision !== expectedRevision) return null;
    return {
      ...node,
      revision: node.revision + 1,
      updatedAt: new Date(node.updatedAt.getTime() + 1),
    };
  });

  const guardCurrentSubjectParticipation =
    mockFn<AcademicStore['guardCurrentSubjectParticipation']>();
  guardCurrentSubjectParticipation.mockResolvedValue(true);

  const guardAcademicAffiliation =
    mockFn<AcademicStore['guardAcademicAffiliation']>();
  guardAcademicAffiliation.mockResolvedValue(true);

  return {
    runAtomically: <T>(operation: () => Promise<T>) => operation(),
    findCatalogNodeById,
    findCatalogNodesByIds,
    findDirectRedirectSources,
    findCatalogNodeBySourceIdentity:
      mockFn<AcademicStore['findCatalogNodeBySourceIdentity']>(),
    searchCatalog: mockFn<AcademicStore['searchCatalog']>(),
    createCatalogNode: mockFn<AcademicStore['createCatalogNode']>(),
    updateCatalogNode: mockFn<AcademicStore['updateCatalogNode']>(),
    bumpCatalogNodeRevision,
    createAffiliation: mockFn<AcademicStore['createAffiliation']>(),
    findAffiliationById: mockFn<AcademicStore['findAffiliationById']>(),
    guardAcademicAffiliation,
    listAffiliationsForUser: mockFn<AcademicStore['listAffiliationsForUser']>(),
    listAffiliationsForExport:
      mockFn<AcademicStore['listAffiliationsForExport']>(),
    updateAffiliationStatus: mockFn<AcademicStore['updateAffiliationStatus']>(),
    updateAffiliationRoles: mockFn<AcademicStore['updateAffiliationRoles']>(),
    transitionAffiliationToAlumni:
      mockFn<AcademicStore['transitionAffiliationToAlumni']>(),
    upsertSubjectParticipation:
      mockFn<AcademicStore['upsertSubjectParticipation']>(),
    guardCurrentSubjectParticipation,
    findSubjectParticipationById:
      mockFn<AcademicStore['findSubjectParticipationById']>(),
    listSubjectParticipationsForUser:
      mockFn<AcademicStore['listSubjectParticipationsForUser']>(),
    listSubjectParticipationsForExport:
      mockFn<AcademicStore['listSubjectParticipationsForExport']>(),
    transitionSubjectParticipationStates:
      mockFn<AcademicStore['transitionSubjectParticipationStates']>(),
    getCurrentContext: mockFn<AcademicStore['getCurrentContext']>(),
    setCurrentContext: mockFn<AcademicStore['setCurrentContext']>(),
    upsertAcademicFollow: mockFn<AcademicStore['upsertAcademicFollow']>(),
    listAcademicFollows: mockFn<AcademicStore['listAcademicFollows']>(),
    listAcademicFollowsForExport:
      mockFn<AcademicStore['listAcademicFollowsForExport']>(),
    removeAcademicFollows: mockFn<AcademicStore['removeAcademicFollows']>(),
    createProposal: mockFn<AcademicStore['createProposal']>(),
    findProposalById: mockFn<AcademicStore['findProposalById']>(),
    listProposals: mockFn<AcademicStore['listProposals']>(),
    reviewProposal: mockFn<AcademicStore['reviewProposal']>(),
    appendAuditEvent: mockFn<AcademicStore['appendAuditEvent']>(),
  };
}

describe('AcademicService', () => {
  it('pages account-export affiliations with an opaque stable-id cursor', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const first = affiliation({
      id: 'aff-001',
      campusId: undefined,
      academicUnitId: undefined,
      roles: undefined,
      startedOn: undefined,
      endedOn: undefined,
    });
    const second = affiliation({ id: 'aff-002' });

    store.listAffiliationsForExport.mockResolvedValueOnce(
      page([first, second], true),
    );

    const firstPage = await service.listAccountExportAffiliations('user-1', {
      limit: 2,
      cursor: null,
    });

    expect(firstPage.items).toEqual([
      {
        id: 'aff-001',
        institutionId: first.institutionId,
        campusId: null,
        academicUnitId: null,
        programId: first.programId ?? null,
        curriculumId: first.curriculumId ?? null,
        status: first.status,
        roles: [],
        startedOn: null,
        endedOn: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      expect.objectContaining({ id: 'aff-002' }),
    ]);
    expect(typeof firstPage.nextCursor).toBe('string');
    expect(store.listAffiliationsForExport.mock.calls).toEqual([
      [
        {
          userId: 'user-1',
          limit: 2,
          afterId: undefined,
        },
      ],
    ]);

    store.listAffiliationsForExport.mockResolvedValueOnce(page([]));
    await service.listAccountExportAffiliations('user-1', {
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    expect(store.listAffiliationsForExport.mock.calls.at(-1)).toEqual([
      {
        userId: 'user-1',
        limit: 2,
        afterId: 'aff-002',
      },
    ]);
  });

  it('rejects malformed account-export cursors before persistence', async () => {
    const store = createStore();
    const service = new AcademicService(store);

    const error = await rejectedUnprocessable(
      service.listAccountExportAffiliations('user-1', {
        limit: 100,
        cursor: 'not-a-valid-export-cursor',
      }),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_EXPORT_CURSOR_INVALID',
    });
    expect(store.listAffiliationsForExport).not.toHaveBeenCalled();
  });

  it('projects bounded subject participation and follow export pages', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const subject = participation({
      id: 'part-001',
      courseOfferingId: undefined,
      periodLabel: undefined,
    });
    const follow = {
      id: 'follow-001',
      userId: 'user-1',
      targetNodeId: 'institution-1',
      targetKind: 'institution' as const,
      createdAt: now,
      updatedAt: now,
    };

    store.listSubjectParticipationsForExport.mockResolvedValue(page([subject]));
    store.listAcademicFollowsForExport.mockResolvedValue(page([follow]));

    await expect(
      service.listAccountExportSubjectParticipations('user-1', {
        limit: 100,
        cursor: null,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 'part-001',
          subjectId: subject.subjectId,
          courseOfferingId: null,
          state: subject.state,
          periodLabel: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      nextCursor: null,
    });

    await expect(
      service.listAccountExportFollows('user-1', {
        limit: 100,
        cursor: null,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 'follow-001',
          targetNodeId: 'institution-1',
          targetKind: 'institution',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      nextCursor: null,
    });
  });

  it('exports the effective sanitized academic current context', async () => {
    const store = createStore();
    const service = new AcademicService(store);

    store.getCurrentContext.mockResolvedValue({
      userId: 'user-1',
      affiliationId: 'aff-1',
      revision: 4,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      service.getAccountExportCurrentContext('user-1'),
    ).resolves.toEqual({
      affiliationId: 'aff-1',
      subjectParticipationId: null,
      revision: 4,
      updatedAt: now.toISOString(),
    });
    expect(store.findAffiliationById).not.toHaveBeenCalled();
    expect(store.findSubjectParticipationById).not.toHaveBeenCalled();
  });

  it('creates canonical nodes with normalized aliases and auditable provenance', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const country = catalogNode();

    store.findCatalogNodesByIds.mockResolvedValue([country]);
    store.findCatalogNodeBySourceIdentity.mockResolvedValue(null);
    store.createCatalogNode.mockImplementation((input) =>
      Promise.resolve({
        ...input,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const result = await service.createCatalogNode('admin-1', {
      kind: 'institution',
      name: '  Universidad   Nacional  ',
      aliases: [' UN ', 'Universidad Nacional'],
      parentIds: [country.id],
      provenance: {
        authorityTier: 'A',
        sourceKey: 'siu',
        sourceUrl: 'https://example.test/siu',
        externalId: '123',
        verifiedAt: now.toISOString(),
      },
    });

    expect(result.node.name).toBe('Universidad Nacional');
    expect(result.node.aliases).toEqual(['UN']);
    expect(store.createCatalogNode).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'institution',
        normalizedName: 'universidad nacional',
        normalizedAliases: ['un'],
        parentIds: [country.id],
      }),
    );
    expect(store.appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'academic.catalog.created',
        actorUserId: 'admin-1',
      }),
    );
  });

  it('rejects hierarchy that invents an invalid parent relation', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const country = catalogNode();

    store.findCatalogNodesByIds.mockResolvedValue([country]);

    await expect(
      service.createCatalogNode('admin-1', {
        kind: 'subject',
        name: 'Álgebra',
        parentIds: [country.id],
        provenance: {
          authorityTier: 'C',
          sourceKey: 'curated',
          sourceUrl: 'https://example.test/evidence',
        },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('supports Subject membership in more than one curriculum', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const planA = catalogNode({
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'curriculum',
      name: 'Plan A',
      normalizedName: 'plan a',
      parentIds: ['33333333-3333-4333-8333-333333333333'],
    });
    const planB = catalogNode({
      id: '66666666-6666-4666-8666-666666666666',
      kind: 'curriculum',
      name: 'Plan B',
      normalizedName: 'plan b',
      parentIds: ['33333333-3333-4333-8333-333333333333'],
    });

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(id === planA.id ? planA : id === planB.id ? planB : null),
    );
    store.findCatalogNodesByIds.mockImplementation((ids) =>
      Promise.resolve([planA, planB].filter((node) => ids.includes(node.id))),
    );
    store.createCatalogNode.mockImplementation((input) =>
      Promise.resolve({
        ...input,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const result = await service.createCatalogNode('admin-1', {
      kind: 'subject',
      name: 'Base de Datos',
      parentIds: [planA.id, planB.id],
      provenance: {
        authorityTier: 'B',
        sourceKey: 'institution',
        sourceUrl: 'https://example.test/plan',
      },
    });

    expect(result.node.parentIds).toEqual([planA.id, planB.id]);
  });

  it('resolves merged IDs without exposing a redirect loop as valid data', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const merged = catalogNode({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'institution',
      status: 'merged',
      redirectToId: '22222222-2222-4222-8222-222222222222',
    });
    const target = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
      name: 'Canonical',
      normalizedName: 'canonical',
    });

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        (() => {
          if (id === merged.id) return merged;
          if (id === target.id) return target;
          return null;
        })(),
      ),
    );

    const resolved = await service.getCatalogNode(merged.id);
    expect(resolved.resolvedFromId).toBe(merged.id);
    expect(resolved.node.id).toBe(target.id);

    store.findCatalogNodeById.mockResolvedValue(merged);
    await expect(service.getCatalogNode(merged.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects affiliation nodes that cross institution boundaries', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const institution = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const foreignProgram = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'program',
      parentIds: ['99999999-9999-4999-8999-999999999999'],
    });

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        (() => {
          if (id === institution.id) return institution;
          if (id === foreignProgram.id) return foreignProgram;
          return null;
        })(),
      ),
    );
    store.findCatalogNodesByIds.mockImplementation((ids) =>
      Promise.resolve(ids.includes(foreignProgram.id) ? [foreignProgram] : []),
    );

    await expect(
      service.createAffiliation('user-1', {
        institutionId: institution.id,
        programId: foreignProgram.id,
        status: 'active',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('does not let one account select another account affiliation', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    store.findAffiliationById.mockResolvedValue(
      affiliation({ userId: 'other-user' }),
    );

    await expect(
      service.setCurrentContext('user-1', {
        expectedRevision: 0,
        affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a course offering outside the selected subject', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const subject = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'subject',
      parentIds: ['44444444-4444-4444-8444-444444444444'],
    });
    const offering = catalogNode({
      id: '77777777-7777-4777-8777-777777777777',
      kind: 'course_offering',
      parentIds: ['88888888-8888-4888-8888-888888888888'],
    });

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        (() => {
          if (id === subject.id) return subject;
          if (id === offering.id) return offering;
          return null;
        })(),
      ),
    );
    store.findCatalogNodesByIds.mockImplementation((ids) =>
      Promise.resolve(
        (() => {
          if (ids.includes(offering.id)) return [offering];
          return [];
        })(),
      ),
    );

    await expect(
      service.upsertSubjectParticipation('user-1', subject.id, {
        courseOfferingId: offering.id,
        state: 'completed',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('keeps missing-data proposals provisional', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const curriculum = catalogNode({
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'curriculum',
    });

    store.findCatalogNodeById.mockResolvedValue(curriculum);
    store.findCatalogNodesByIds.mockResolvedValue([curriculum]);
    store.createProposal.mockImplementation((input) =>
      Promise.resolve({
        ...input,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const result = await service.createProposal('user-1', {
      kind: 'subject',
      proposedName: '  Materia nueva ',
      parentIds: [curriculum.id],
      notes: 'Plan oficial',
    });

    expect(result.proposal).toEqual(
      expect.objectContaining({
        proposedName: 'Materia nueva',
        status: 'pending',
      }),
    );
    expect(store.createCatalogNode).not.toHaveBeenCalled();
  });

  it('uses opaque bounded cursors for catalog pagination', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const first = catalogNode({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'A',
      normalizedName: 'a',
    });

    store.searchCatalog.mockResolvedValueOnce({
      items: [first],
      hasMore: true,
    });

    const page = await service.searchCatalog({ limit: 1 });
    expect(page.nextCursor).toEqual(expect.any(String));

    store.searchCatalog.mockResolvedValueOnce({
      items: [],
      hasMore: false,
    });

    await service.searchCatalog({
      limit: 1,
      cursor: page.nextCursor ?? undefined,
    });

    expect(store.searchCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        after: { normalizedName: 'a', id: first.id },
      }),
    );
  });

  it('fails closed on optimistic revision conflict', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const existing = catalogNode({
      kind: 'institution',
      parentIds: ['00000000-0000-4000-8000-000000000000'],
    });
    const parent = catalogNode({
      id: '00000000-0000-4000-8000-000000000000',
    });

    store.findCatalogNodeById.mockResolvedValue(existing);
    store.findCatalogNodesByIds.mockResolvedValue([parent]);
    store.updateCatalogNode.mockResolvedValue(null);

    await expect(
      service.updateCatalogNode('admin-1', existing.id, {
        expectedRevision: 1,
        name: 'Renamed',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('accepts a current participation when affiliation and participation belong together', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const row = affiliation();
    const curriculum = catalogNode({
      id: row.curriculumId!,
      kind: 'curriculum',
    });
    const subject = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'subject',
      parentIds: [curriculum.id],
    });
    const part = participation({ state: 'current' });

    store.findAffiliationById.mockResolvedValue(row);
    store.findSubjectParticipationById.mockResolvedValue(part);
    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        id === subject.id ? subject : id === curriculum.id ? curriculum : null,
      ),
    );
    store.setCurrentContext.mockImplementation((input, expectedRevision) =>
      Promise.resolve({
        ...input,
        revision: expectedRevision + 1,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const result = await service.setCurrentContext('user-1', {
      expectedRevision: 0,
      affiliationId: row.id,
      subjectParticipationId: part.id,
    });
    expect(result.context.affiliationId).toBe(row.id);
    expect(result.context.subjectParticipationId).toBe(part.id);
  });

  it('revalidates current participation inside context transaction', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const row = affiliation();
    const curriculum = catalogNode({
      id: row.curriculumId!,
      kind: 'curriculum',
    });
    const subject = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'subject',
      parentIds: [curriculum.id],
    });
    const part = participation({ state: 'current' });

    store.findAffiliationById.mockResolvedValue(row);
    store.findSubjectParticipationById.mockResolvedValue(part);
    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        id === subject.id ? subject : id === curriculum.id ? curriculum : null,
      ),
    );
    // Simulate the lifecycle transition winning after the optimistic read above
    // but before the context transaction acquires its participation write guard.
    store.guardCurrentSubjectParticipation.mockResolvedValue(false);

    await expect(
      service.setCurrentContext('user-1', {
        expectedRevision: 0,
        affiliationId: row.id,
        subjectParticipationId: part.id,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(store.guardCurrentSubjectParticipation).toHaveBeenCalledWith(
      'user-1',
      part.id,
    );
    expect(store.getCurrentContext).not.toHaveBeenCalled();
    expect(store.setCurrentContext).not.toHaveBeenCalled();
  });

  it('rejects context selection when affiliation changes before commit', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const row = affiliation({ status: 'active' });
    const curriculum = catalogNode({
      id: row.curriculumId!,
      kind: 'curriculum',
    });
    const subject = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'subject',
      parentIds: [curriculum.id],
    });
    const part = participation({ state: 'current' });

    store.findAffiliationById.mockResolvedValue(row);
    store.findSubjectParticipationById.mockResolvedValue(part);
    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        id === subject.id ? subject : id === curriculum.id ? curriculum : null,
      ),
    );
    // Graduation/status transition won after the optimistic affiliation read.
    store.guardAcademicAffiliation.mockResolvedValue(false);

    const error = await rejectedUnprocessable(
      service.setCurrentContext('user-1', {
        expectedRevision: 0,
        affiliationId: row.id,
        subjectParticipationId: part.id,
      }),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_CONTEXT_INELIGIBLE',
    });
    expect(store.guardAcademicAffiliation.mock.calls).toContainEqual([
      'user-1',
      row.id,
      'active',
    ]);
    expect(store.guardCurrentSubjectParticipation).not.toHaveBeenCalled();
    expect(store.setCurrentContext).not.toHaveBeenCalled();
  });
  it('rejects current subject context on an applicant affiliation', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const row = affiliation({ status: 'applicant' });
    const part = participation({ state: 'current' });

    store.findAffiliationById.mockResolvedValue(row);
    store.findSubjectParticipationById.mockResolvedValue(part);

    const error = await rejectedUnprocessable(
      service.setCurrentContext('user-1', {
        expectedRevision: 0,
        affiliationId: row.id,
        subjectParticipationId: part.id,
      }),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_CONTEXT_INELIGIBLE',
    });
    expect(store.guardAcademicAffiliation).not.toHaveBeenCalled();
    expect(store.setCurrentContext).not.toHaveBeenCalled();
  });

  for (const state of ['planned', 'completed', 'dropped'] as const) {
    it(`rejects ${state} participation as current subject context`, async () => {
      const store = createStore();
      const service = new AcademicService(store);
      const row = affiliation();
      const part = participation({ state });

      store.findAffiliationById.mockResolvedValue(row);
      store.findSubjectParticipationById.mockResolvedValue(part);

      await expect(
        service.setCurrentContext('user-1', {
          expectedRevision: 0,
          affiliationId: row.id,
          subjectParticipationId: part.id,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(store.guardCurrentSubjectParticipation).not.toHaveBeenCalled();
      expect(store.setCurrentContext).not.toHaveBeenCalled();
    });
  }

  it('rejects a stale current-context revision before mutation', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const row = affiliation();

    store.findAffiliationById.mockResolvedValue(row);
    store.getCurrentContext.mockResolvedValue({
      userId: 'user-1',
      affiliationId: row.id,
      revision: 2,
      createdAt: now,
      updatedAt: now,
    });

    const error = await rejectedConflict(
      service.setCurrentContext('user-1', {
        expectedRevision: 1,
        affiliationId: row.id,
      }),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_CONTEXT_REVISION_CONFLICT',
    });
    expect(store.setCurrentContext).not.toHaveBeenCalled();
  });

  it('rejects malformed pagination cursors', async () => {
    const store = createStore();
    const service = new AcademicService(store);

    await expect(
      service.searchCatalog({ limit: 10, cursor: 'not-json' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects duplicate external source identities before insertion', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const country = catalogNode();
    const existing = catalogNode({
      kind: 'institution',
      parentIds: [country.id],
    });

    store.findCatalogNodesByIds.mockResolvedValue([country]);
    store.findCatalogNodeBySourceIdentity.mockResolvedValue(existing);

    await expect(
      service.createCatalogNode('admin-1', {
        kind: 'institution',
        name: 'Duplicate',
        parentIds: [country.id],
        provenance: {
          authorityTier: 'A',
          sourceKey: 'official',
          sourceUrl: 'https://example.test/source',
          externalId: 'AR',
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(store.createCatalogNode).not.toHaveBeenCalled();
  });

  it('updates a canonical node while preserving optimistic revision control', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const country = catalogNode();
    const existing = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
      name: 'Old Name',
      normalizedName: 'old name',
      parentIds: [country.id],
    });

    store.findCatalogNodeById.mockResolvedValue(existing);
    store.findCatalogNodesByIds.mockResolvedValue([country]);
    store.updateCatalogNode.mockImplementation((_id, _revision, patch) =>
      Promise.resolve({
        ...existing,
        ...patch,
        revision: 2,
        updatedAt: new Date('2026-09-22T21:00:00.000Z'),
      }),
    );

    const result = await service.updateCatalogNode('admin-1', existing.id, {
      expectedRevision: 1,
      name: 'New Name',
      aliases: ['NN', 'New Name'],
      status: 'inactive',
      parentIds: [country.id],
      provenance: {
        authorityTier: 'B',
        sourceKey: 'institution',
        sourceUrl: 'https://example.test/current',
        verifiedAt: now.toISOString(),
      },
    });

    expect(result.node).toEqual(
      expect.objectContaining({
        name: 'New Name',
        aliases: ['NN'],
        status: 'inactive',
        revision: 2,
      }),
    );
    expect(store.appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'academic.catalog.updated' }),
    );
  });

  it('rejects updates to already merged nodes', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    store.findCatalogNodeById.mockResolvedValue(
      catalogNode({ status: 'merged', redirectToId: 'target' }),
    );

    await expect(
      service.updateCatalogNode('admin-1', 'source', {
        expectedRevision: 2,
        name: 'Nope',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('merges same-kind nodes and writes an audit redirect', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const source = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
      name: 'Duplicate',
      normalizedName: 'duplicate',
    });
    const target = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'institution',
      name: 'Canonical',
      normalizedName: 'canonical',
    });

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        (() => {
          if (id === source.id) return source;
          if (id === target.id) return target;
          return null;
        })(),
      ),
    );
    store.updateCatalogNode.mockImplementation((_id, _revision, patch) =>
      Promise.resolve({
        ...source,
        ...patch,
        revision: 2,
      }),
    );

    const result = await service.mergeCatalogNode(
      'admin-1',
      source.id,
      target.id,
      1,
    );

    expect(result.source).toEqual(
      expect.objectContaining({
        status: 'merged',
        redirectToId: target.id,
      }),
    );
    expect(store.appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'academic.catalog.merged',
        targetId: source.id,
      }),
    );
  });

  it('does not mutate source when canonical target revision changed concurrently', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const source = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const target = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'institution',
    });

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        id === source.id ? source : id === target.id ? target : null,
      ),
    );
    store.bumpCatalogNodeRevision.mockResolvedValueOnce(null);

    const error = await rejectedConflict(
      service.mergeCatalogNode('admin-1', source.id, target.id, 1),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_REVISION_CONFLICT',
    });
    expect(store.updateCatalogNode.mock.calls).toHaveLength(0);
    expect(store.appendAuditEvent.mock.calls).toHaveLength(0);
  });

  it('rejects self merges, kind mismatches and merge revision conflicts', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const source = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const target = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'program',
    });

    await expect(
      service.mergeCatalogNode('admin-1', source.id, source.id, 1),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        (() => {
          if (id === source.id) return source;
          if (id === target.id) return target;
          return null;
        })(),
      ),
    );

    await expect(
      service.mergeCatalogNode('admin-1', source.id, target.id, 1),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const sameKindTarget = { ...target, kind: 'institution' as const };
    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        (() => {
          if (id === source.id) return source;
          if (id === sameKindTarget.id) return sameKindTarget;
          return null;
        })(),
      ),
    );
    store.updateCatalogNode.mockResolvedValue(null);

    await expect(
      service.mergeCatalogNode('admin-1', source.id, sameKindTarget.id, 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates, lists and updates an owned affiliation', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const institution = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const program = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'program',
      parentIds: [institution.id],
    });
    const created = affiliation({
      institutionId: institution.id,
      programId: program.id,
      curriculumId: undefined,
    });

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        (() => {
          if (id === institution.id) return institution;
          if (id === program.id) return program;
          return null;
        })(),
      ),
    );
    store.findCatalogNodesByIds.mockImplementation((ids) =>
      Promise.resolve(ids.includes(program.id) ? [program] : []),
    );
    store.createAffiliation.mockResolvedValue(created);
    store.listAffiliationsForUser.mockResolvedValue(page([created]));
    store.findAffiliationById.mockResolvedValue(created);
    store.updateAffiliationStatus.mockResolvedValue({
      ...created,
      status: 'paused',
    });

    const createdResult = await service.createAffiliation('user-1', {
      institutionId: institution.id,
      programId: program.id,
      status: 'active',
      startedOn: '2025',
    });
    expect(createdResult.affiliation.id).toBe(created.id);

    await expect(service.listAffiliations('user-1')).resolves.toEqual(
      expect.objectContaining({
        affiliations: [expect.objectContaining({ id: created.id })],
      }),
    );

    const updatedResult = await service.updateAffiliationStatus(
      'user-1',
      created.id,
      {
        status: 'paused',
      },
    );
    expect(updatedResult.affiliation.status).toBe('paused');
    expect(store.updateAffiliationStatus).toHaveBeenCalledWith(
      'user-1',
      created.id,
      'active',
      'paused',
      undefined,
    );
  });

  it('rejects status transitions that would leave incompatible roles', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    store.findAffiliationById.mockResolvedValue(
      affiliation({ status: 'active', roles: ['student'] }),
    );

    await expect(
      service.updateAffiliationStatus(
        'user-1',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        { status: 'completed' },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(store.updateAffiliationStatus).not.toHaveBeenCalled();
  });

  it('fails closed when an affiliation status changes concurrently', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const existing = affiliation({ status: 'active', roles: ['mentor'] });
    store.findAffiliationById.mockResolvedValue(existing);
    store.updateAffiliationStatus.mockResolvedValue(null);

    await expect(
      service.updateAffiliationStatus('user-1', existing.id, {
        status: 'completed',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(store.updateAffiliationStatus).toHaveBeenCalledWith(
      'user-1',
      existing.id,
      'active',
      'completed',
      undefined,
    );
  });

  it('returns not found when an affiliation status update is not owned', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    store.updateAffiliationStatus.mockResolvedValue(null);

    await expect(
      service.updateAffiliationStatus('user-1', 'missing', {
        status: 'withdrawn',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('upserts and lists a direct subject participation', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const subject = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'subject',
    });
    const row = participation({ subjectId: subject.id });

    store.findCatalogNodeById.mockResolvedValue(subject);
    store.upsertSubjectParticipation.mockResolvedValue(row);
    store.listSubjectParticipationsForUser.mockResolvedValue(page([row]));

    const upsertResult = await service.upsertSubjectParticipation(
      'user-1',
      subject.id,
      {
        state: 'completed',
        periodLabel: '2026 S2',
      },
    );
    expect(upsertResult.participation.id).toBe(row.id);

    const listResult = await service.listSubjectParticipations('user-1');
    expect(listResult.participations.map((item) => item.id)).toEqual([row.id]);
  });

  for (const state of ['planned', 'completed', 'dropped'] as const) {
    it(`clears selected context when participation becomes ${state}`, async () => {
      const store = createStore();
      const service = new AcademicService(store);
      const subject = catalogNode({
        id: '55555555-5555-4555-8555-555555555555',
        kind: 'subject',
      });
      const selected = participation({ subjectId: subject.id });
      const historical = participation({
        ...selected,
        state,
      });

      store.findCatalogNodeById.mockResolvedValue(subject);
      store.upsertSubjectParticipation.mockResolvedValue(historical);
      store.getCurrentContext.mockResolvedValue({
        userId: 'user-1',
        affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        subjectParticipationId: selected.id,
        revision: 4,
        createdAt: now,
        updatedAt: now,
      });
      store.setCurrentContext.mockResolvedValue({
        userId: 'user-1',
        affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        revision: 5,
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.upsertSubjectParticipation(
        'user-1',
        subject.id,
        {
          state,
          periodLabel: '2026 S2',
        },
      );

      expect(result.participation).toMatchObject({
        id: selected.id,
        state,
      });
      expect(store.setCurrentContext).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        },
        4,
      );

      const contextAudit = store.appendAuditEvent.mock.calls
        .map(([entry]) => entry)
        .find((entry) => entry.event === 'academic.context.updated');
      expect(contextAudit).toMatchObject({
        event: 'academic.context.updated',
        metadata: {
          revision: 5,
          reason: 'subject_participation_no_longer_current',
        },
      });
    });
  }

  it('does not clear an unrelated current subject when another participation becomes historical', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const subject = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'subject',
    });
    const historical = participation({
      subjectId: subject.id,
      state: 'completed',
    });

    store.findCatalogNodeById.mockResolvedValue(subject);
    store.upsertSubjectParticipation.mockResolvedValue(historical);
    store.getCurrentContext.mockResolvedValue({
      userId: 'user-1',
      affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subjectParticipationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      revision: 4,
      createdAt: now,
      updatedAt: now,
    });

    await service.upsertSubjectParticipation('user-1', subject.id, {
      state: 'completed',
    });

    expect(store.setCurrentContext).not.toHaveBeenCalled();
  });

  it('fails closed if current context changes while clearing a historical participation', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const subject = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'subject',
    });
    const historical = participation({
      subjectId: subject.id,
      state: 'dropped',
    });

    store.findCatalogNodeById.mockResolvedValue(subject);
    store.upsertSubjectParticipation.mockResolvedValue(historical);
    store.getCurrentContext.mockResolvedValue({
      userId: 'user-1',
      affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subjectParticipationId: historical.id,
      revision: 7,
      createdAt: now,
      updatedAt: now,
    });
    store.setCurrentContext.mockResolvedValue(null);

    const error = await rejectedConflict(
      service.upsertSubjectParticipation('user-1', subject.id, {
        state: 'dropped',
      }),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_CONTEXT_REVISION_CONFLICT',
    });
    expect(store.setCurrentContext).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      7,
    );
  });

  it('scopes current subject choices with the canonical lifecycle and affiliation rule', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const selected = affiliation();
    const eligibleCurrent = participation({
      id: '77777777-7777-4777-8777-777777777771',
      subjectId: '55555555-5555-4555-8555-555555555555',
      state: 'current',
    });
    const historical = [
      participation({
        id: '77777777-7777-4777-8777-777777777772',
        subjectId: eligibleCurrent.subjectId,
        state: 'planned',
      }),
      participation({
        id: '77777777-7777-4777-8777-777777777773',
        subjectId: eligibleCurrent.subjectId,
        state: 'completed',
      }),
      participation({
        id: '77777777-7777-4777-8777-777777777774',
        subjectId: eligibleCurrent.subjectId,
        state: 'dropped',
      }),
    ];
    const outsideCurrent = participation({
      id: '77777777-7777-4777-8777-777777777775',
      subjectId: '66666666-6666-4666-8666-666666666666',
      state: 'current',
    });
    const eligibleSubject = catalogNode({
      id: eligibleCurrent.subjectId,
      kind: 'subject',
      name: 'Álgebra',
    });

    store.findAffiliationById.mockResolvedValue(selected);
    store.listSubjectParticipationsForUser.mockResolvedValue(
      page([eligibleCurrent, ...historical, outsideCurrent]),
    );
    jest
      .spyOn(service, 'participationBelongsToAffiliation')
      .mockImplementation((subjectId) =>
        Promise.resolve(subjectId === eligibleCurrent.subjectId),
      );
    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(id === eligibleSubject.id ? eligibleSubject : null),
    );

    const result = await service.listSubjectParticipations(
      'user-1',
      selected.id,
    );

    expect(result).toMatchObject({
      participations: [
        expect.objectContaining({
          id: eligibleCurrent.id,
          subjectId: eligibleCurrent.subjectId,
          subjectName: 'Álgebra',
          state: 'current',
        }),
      ],
      truncated: false,
      limit: ACADEMIC_PARTICIPATION_VISIBLE_LIMIT,
    });
    expect(store.listSubjectParticipationsForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      states: ['current'],
      limit: ACADEMIC_PARTICIPATION_DECISION_LIMIT,
    });
  });

  it('exposes no current-subject choices for applicant affiliation', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const selected = affiliation({ status: 'applicant' });

    store.findAffiliationById.mockResolvedValue(selected);

    await expect(
      service.listSubjectParticipations('user-1', selected.id),
    ).resolves.toEqual({
      participations: [],
      truncated: false,
      limit: ACADEMIC_PARTICIPATION_VISIBLE_LIMIT,
    });
    expect(store.listSubjectParticipationsForUser).not.toHaveBeenCalled();
  });

  it('fails closed when affiliation-scoped subject eligibility exceeds its decision budget', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const selected = affiliation();

    store.findAffiliationById.mockResolvedValue(selected);
    store.listSubjectParticipationsForUser.mockResolvedValue(page([], true));

    const error = await rejectedConflict(
      service.listSubjectParticipations('user-1', selected.id),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_INVENTORY_OVERFLOW',
      collection: 'subject_participations',
    });
  });

  it('returns honest truncation metadata for visible affiliations', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const institution = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const row = affiliation({
      programId: undefined,
      curriculumId: undefined,
    });
    store.findCatalogNodeById.mockResolvedValue(institution);
    store.listAffiliationsForUser.mockResolvedValue(page([row], true));

    await expect(service.listAffiliations('user-1')).resolves.toMatchObject({
      affiliations: [expect.objectContaining({ id: row.id })],
      truncated: true,
      limit: ACADEMIC_AFFILIATION_VISIBLE_LIMIT,
    });

    expect(store.listAffiliationsForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      limit: ACADEMIC_AFFILIATION_VISIBLE_LIMIT,
    });
  });

  it('fails closed when current-subject eligibility exceeds affiliation decision budget', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const subject = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'subject',
    });
    store.findCatalogNodeById.mockResolvedValue(subject);
    store.listAffiliationsForUser.mockResolvedValue(page([], true));

    const error = await rejectedConflict(
      service.upsertSubjectParticipation('user-1', subject.id, {
        state: 'current',
      }),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_INVENTORY_OVERFLOW',
      collection: 'affiliations',
    });
    expect(store.listAffiliationsForUser.mock.calls).toContainEqual([
      {
        userId: 'user-1',
        statuses: ['active', 'paused'],
        limit: ACADEMIC_AFFILIATION_DECISION_LIMIT,
      },
    ]);
    expect(store.upsertSubjectParticipation.mock.calls).toHaveLength(0);
  });

  it('returns and updates current academic context without accepting withdrawn context', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const active = affiliation({ status: 'active' });
    const withdrawn = affiliation({ status: 'withdrawn' });

    store.getCurrentContext.mockResolvedValue({
      userId: 'user-1',
      affiliationId: active.id,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });

    const contextResult = await service.getCurrentContext('user-1');
    expect(contextResult.context?.affiliationId).toBe(active.id);

    store.getCurrentContext.mockResolvedValue(null);
    await expect(service.getCurrentContext('user-1')).resolves.toEqual({
      context: null,
    });

    store.findAffiliationById.mockResolvedValue(withdrawn);
    await expect(
      service.setCurrentContext('user-1', {
        expectedRevision: 0,
        affiliationId: withdrawn.id,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('reconciles historical legacy subject context', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const legacy = {
      userId: 'user-1',
      affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subjectParticipationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      revision: 3,
      createdAt: now,
      updatedAt: now,
    };
    const historical = participation({
      id: legacy.subjectParticipationId,
      state: 'completed',
    });

    store.getCurrentContext.mockResolvedValue(legacy);
    store.findSubjectParticipationById.mockResolvedValue(historical);
    store.setCurrentContext.mockResolvedValue({
      userId: legacy.userId,
      affiliationId: legacy.affiliationId,
      revision: 4,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.getCurrentContext('user-1');

    expect(result.context).toMatchObject({
      affiliationId: legacy.affiliationId,
      revision: 4,
    });
    expect(result.context?.subjectParticipationId).toBeUndefined();
    expect(store.setCurrentContext).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        affiliationId: legacy.affiliationId,
      },
      3,
    );

    const audit = store.appendAuditEvent.mock.calls
      .map(([entry]) => entry)
      .find((entry) => entry.event === 'academic.context.updated');
    expect(audit).toMatchObject({
      metadata: {
        affiliationId: legacy.affiliationId,
        revision: 4,
        reason: 'stored_subject_context_no_longer_eligible',
      },
    });
  });

  it('re-reads authority when another reader repairs legacy context first', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const legacy = {
      userId: 'user-1',
      affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subjectParticipationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      revision: 3,
      createdAt: now,
      updatedAt: now,
    };
    const repaired = {
      userId: legacy.userId,
      affiliationId: legacy.affiliationId,
      revision: 4,
      createdAt: now,
      updatedAt: now,
    };

    store.getCurrentContext
      .mockResolvedValueOnce(legacy)
      .mockResolvedValueOnce(repaired);
    store.findSubjectParticipationById.mockResolvedValue(
      participation({
        id: legacy.subjectParticipationId,
        state: 'completed',
      }),
    );
    store.setCurrentContext.mockResolvedValueOnce(null);

    const result = await service.getCurrentContext('user-1');

    expect(result.context?.affiliationId).toBe(legacy.affiliationId);
    expect(result.context?.revision).toBe(4);
    expect(result.context?.subjectParticipationId).toBeUndefined();
    expect(store.setCurrentContext.mock.calls).toHaveLength(1);
  });

  it('fails closed after repeated legacy reconciliation CAS loss', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const legacy = {
      userId: 'user-1',
      affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subjectParticipationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      revision: 3,
      createdAt: now,
      updatedAt: now,
    };

    store.getCurrentContext.mockResolvedValue(legacy);
    store.findSubjectParticipationById.mockResolvedValue(
      participation({
        id: legacy.subjectParticipationId,
        state: 'dropped',
      }),
    );
    store.setCurrentContext.mockResolvedValue(null);

    const error = await rejectedConflict(service.getCurrentContext('user-1'));

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_CONTEXT_REVISION_CONFLICT',
    });
    expect(store.setCurrentContext.mock.calls).toHaveLength(2);
  });

  it('keeps stored subject context when shared eligibility remains valid', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const row = affiliation({ status: 'active' });
    const part = participation({ state: 'current' });
    const current = {
      userId: 'user-1',
      affiliationId: row.id,
      subjectParticipationId: part.id,
      revision: 5,
      createdAt: now,
      updatedAt: now,
    };

    store.getCurrentContext.mockResolvedValue(current);
    store.findAffiliationById.mockResolvedValue(row);
    store.findSubjectParticipationById.mockResolvedValue(part);
    jest
      .spyOn(service, 'participationBelongsToAffiliation')
      .mockResolvedValue(true);

    const result = await service.getCurrentContext('user-1');

    expect(result.context?.affiliationId).toBe(row.id);
    expect(result.context?.subjectParticipationId).toBe(part.id);
    expect(result.context?.revision).toBe(5);
    expect(store.setCurrentContext.mock.calls).toHaveLength(0);
  });

  it('clears stored subject context when affiliation no longer allows it', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const current = {
      userId: 'user-1',
      affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subjectParticipationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      revision: 5,
      createdAt: now,
      updatedAt: now,
    };

    store.getCurrentContext.mockResolvedValue(current);
    store.findAffiliationById.mockResolvedValue(
      affiliation({ id: current.affiliationId, status: 'completed' }),
    );
    store.findSubjectParticipationById.mockResolvedValue(
      participation({ id: current.subjectParticipationId, state: 'current' }),
    );
    store.setCurrentContext.mockResolvedValue({
      userId: 'user-1',
      affiliationId: current.affiliationId,
      revision: 6,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.getCurrentContext('user-1');

    expect(result.context?.subjectParticipationId).toBeUndefined();
    expect(result.context?.revision).toBe(6);
  });

  it('clears stored subject context when graph membership no longer matches', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const row = affiliation({ status: 'active' });
    const part = participation({ state: 'current' });
    const current = {
      userId: 'user-1',
      affiliationId: row.id,
      subjectParticipationId: part.id,
      revision: 5,
      createdAt: now,
      updatedAt: now,
    };

    store.getCurrentContext.mockResolvedValue(current);
    store.findAffiliationById.mockResolvedValue(row);
    store.findSubjectParticipationById.mockResolvedValue(part);
    jest
      .spyOn(service, 'participationBelongsToAffiliation')
      .mockResolvedValue(false);
    store.setCurrentContext.mockResolvedValue({
      userId: 'user-1',
      affiliationId: row.id,
      revision: 6,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.getCurrentContext('user-1');

    expect(result.context?.subjectParticipationId).toBeUndefined();
    expect(result.context?.revision).toBe(6);
  });

  it('rejects a participation outside the selected affiliation context', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const row = affiliation();
    const part = participation({
      subjectId: '55555555-5555-4555-8555-555555555555',
    });
    const subject = catalogNode({
      id: part.subjectId,
      kind: 'subject',
      parentIds: ['99999999-9999-4999-8999-999999999999'],
    });

    store.findAffiliationById.mockResolvedValue(row);
    store.findSubjectParticipationById.mockResolvedValue(part);
    store.findCatalogNodesByIds.mockImplementation((ids) =>
      Promise.resolve(ids.includes(subject.id) ? [subject] : []),
    );

    await expect(
      service.setCurrentContext('user-1', {
        expectedRevision: 0,
        affiliationId: row.id,
        subjectParticipationId: part.id,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects proposals that reference unknown canonical parents', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    store.findCatalogNodesByIds.mockResolvedValue([]);

    await expect(
      service.createProposal('user-1', {
        kind: 'subject',
        proposedName: 'Unknown',
        parentIds: ['44444444-4444-4444-8444-444444444444'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails closed for missing nodes and invalid redirect records', async () => {
    const store = createStore();
    const service = new AcademicService(store);

    store.findCatalogNodeById.mockResolvedValueOnce(null);
    await expect(service.getCatalogNode('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    store.findCatalogNodeById.mockResolvedValue(
      catalogNode({
        status: 'merged',
        redirectToId: undefined,
      }),
    );
    await expect(
      service.getCatalogNode('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects invalid node kind use and invalid parent cardinality', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const wrongKind = catalogNode({ kind: 'country' });

    store.findCatalogNodeById.mockResolvedValue(wrongKind);
    await expect(
      service.upsertSubjectParticipation('user-1', wrongKind.id, {
        state: 'current',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const countryA = catalogNode({
      id: '00000000-0000-4000-8000-000000000001',
    });
    const countryB = catalogNode({
      id: '00000000-0000-4000-8000-000000000002',
    });
    store.findCatalogNodesByIds.mockResolvedValue([countryA, countryB]);

    await expect(
      service.createCatalogNode('admin-1', {
        kind: 'institution',
        name: 'Two parents',
        parentIds: [countryA.id, countryB.id],
        provenance: {
          authorityTier: 'C',
          sourceKey: 'curated',
          sourceUrl: 'https://example.test/source',
        },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('lists canonical children using the resolved parent id', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const parent = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const child = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'program',
      parentIds: [parent.id],
    });

    store.findCatalogNodeById.mockResolvedValue(parent);
    store.searchCatalog.mockResolvedValue({
      items: [child],
      hasMore: false,
    });

    const children = await service.listChildren(parent.id, 'program', 10);
    expect(children.parent.id).toBe(parent.id);
    expect(children.items.map((item) => item.id)).toEqual([child.id]);
    expect(children.truncated).toBe(false);
  });

  it('rejects malformed catalog cursors', async () => {
    const store = createStore();
    const service = new AcademicService(store);

    await expect(
      service.searchCatalog({ limit: 10, cursor: 'not-a-valid-cursor' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(store.searchCatalog).not.toHaveBeenCalled();
  });

  it('lists resolved children with bounded truncation', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const parent = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const child = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'program',
      parentIds: [parent.id],
    });

    store.findCatalogNodeById.mockResolvedValue(parent);
    store.searchCatalog.mockResolvedValue({
      items: [child],
      hasMore: true,
    });

    const result = await service.listChildren(parent.id, 'program', 1);

    expect(result.parent.id).toBe(parent.id);
    expect(result.items).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(store.searchCatalog).toHaveBeenCalledWith({
      kind: 'program',
      parentIds: [parent.id],
      limit: 1,
    });
  });

  it('rejects duplicate authoritative source identities', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const country = catalogNode();
    const existing = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
      parentIds: [country.id],
    });

    store.findCatalogNodesByIds.mockResolvedValue([country]);
    store.findCatalogNodeBySourceIdentity.mockResolvedValue(existing);

    await expect(
      service.createCatalogNode('admin-1', {
        kind: 'institution',
        name: 'Duplicate',
        parentIds: [country.id],
        provenance: {
          authorityTier: 'A',
          sourceKey: 'siu',
          sourceUrl: 'https://example.test/siu',
          externalId: 'same-id',
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(store.createCatalogNode).not.toHaveBeenCalled();
  });

  it('updates a catalog node and refreshes normalized values', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const country = catalogNode();
    const existing = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
      name: 'Old',
      normalizedName: 'old',
      parentIds: [country.id],
    });

    store.findCatalogNodeById.mockResolvedValue(existing);
    store.findCatalogNodesByIds.mockResolvedValue([country]);
    store.updateCatalogNode.mockImplementation((_id, _revision, patch) =>
      Promise.resolve({
        ...existing,
        ...patch,
        revision: 2,
        updatedAt: now,
      }),
    );

    const result = await service.updateCatalogNode('admin-1', existing.id, {
      expectedRevision: 1,
      name: ' Nueva   Universidad ',
      aliases: [' NU ', 'Nueva Universidad'],
      status: 'inactive',
      provenance: {
        authorityTier: 'B',
        sourceKey: 'official-site',
        sourceUrl: 'https://example.test/official',
      },
    });

    expect(result.node).toEqual(
      expect.objectContaining({
        name: 'Nueva Universidad',
        aliases: ['NU'],
        status: 'inactive',
        revision: 2,
      }),
    );
    expect(store.appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'academic.catalog.updated' }),
    );
  });

  it('keeps merged catalog nodes immutable', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    store.findCatalogNodeById.mockResolvedValue(
      catalogNode({ status: 'merged', redirectToId: 'target' }),
    );

    await expect(
      service.updateCatalogNode('admin-1', 'source', {
        expectedRevision: 1,
        name: 'Nope',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates merge invariants and records a successful merge', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const source = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const target = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'institution',
    });

    await expect(
      service.mergeCatalogNode('admin-1', source.id, source.id, 1),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        (() => {
          if (id === source.id) return source;
          if (id === target.id) return target;
          return null;
        })(),
      ),
    );
    store.updateCatalogNode.mockImplementation((_id, _revision, patch) =>
      Promise.resolve({
        ...source,
        ...patch,
        revision: 2,
        updatedAt: now,
      }),
    );

    const result = await service.mergeCatalogNode(
      'admin-1',
      source.id,
      target.id,
      1,
    );

    expect(result.source.status).toBe('merged');
    expect(result.source.redirectToId).toBe(target.id);
    expect(store.appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'academic.catalog.merged',
        targetId: source.id,
      }),
    );
  });

  it('rejects merge across different node kinds and already-merged sources', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const source = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const target = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'program',
    });

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        (() => {
          if (id === source.id) return source;
          if (id === target.id) return target;
          return null;
        })(),
      ),
    );

    await expect(
      service.mergeCatalogNode('admin-1', source.id, target.id, 1),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        (() => {
          if (id === source.id) {
            return {
              ...source,
              status: 'merged',
              redirectToId: target.id,
            };
          }
          return target;
        })(),
      ),
    );

    await expect(
      service.mergeCatalogNode('admin-1', source.id, target.id, 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists and updates only the acting users affiliations', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const row = affiliation();
    const institution = catalogNode({
      id: row.institutionId,
      kind: 'institution',
    });
    const program = catalogNode({
      id: row.programId!,
      kind: 'program',
      parentIds: [institution.id],
    });
    const curriculum = catalogNode({
      id: row.curriculumId!,
      kind: 'curriculum',
      parentIds: [program.id],
    });

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        id === institution.id
          ? institution
          : id === program.id
            ? program
            : id === curriculum.id
              ? curriculum
              : null,
      ),
    );
    store.listAffiliationsForUser.mockResolvedValue(page([row]));
    store.findAffiliationById.mockResolvedValue(row);
    store.updateAffiliationStatus.mockResolvedValue({
      ...row,
      status: 'paused',
    });

    await expect(service.listAffiliations('user-1')).resolves.toEqual({
      affiliations: [expect.objectContaining({ id: row.id, status: 'active' })],
      truncated: false,
      limit: ACADEMIC_AFFILIATION_VISIBLE_LIMIT,
    });

    const updateResult = await service.updateAffiliationStatus(
      'user-1',
      row.id,
      {
        status: 'paused',
      },
    );
    expect(updateResult.affiliation.id).toBe(row.id);
    expect(updateResult.affiliation.status).toBe('paused');
    expect(store.updateAffiliationStatus).toHaveBeenCalledWith(
      'user-1',
      row.id,
      'active',
      'paused',
      undefined,
    );

    store.findAffiliationById.mockResolvedValueOnce(null);
    await expect(
      service.updateAffiliationStatus('user-1', 'missing', {
        status: 'paused',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a valid affiliation over canonical ancestry', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const institution = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
      parentIds: ['11111111-1111-4111-8111-111111111111'],
    });
    const program = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'program',
      parentIds: [institution.id],
    });
    const curriculum = catalogNode({
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'curriculum',
      parentIds: [program.id],
    });

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        (() => {
          if (id === institution.id) return institution;
          if (id === program.id) return program;
          if (id === curriculum.id) return curriculum;
          return null;
        })(),
      ),
    );
    store.findCatalogNodesByIds.mockImplementation((ids) =>
      Promise.resolve(
        (() => {
          const all = [institution, program, curriculum];
          return all.filter((node) => ids.includes(node.id));
        })(),
      ),
    );
    store.createAffiliation.mockImplementation((input) =>
      Promise.resolve({
        ...input,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const result = await service.createAffiliation('user-1', {
      institutionId: institution.id,
      programId: program.id,
      curriculumId: curriculum.id,
      status: 'active',
      startedOn: '2026',
    });

    expect(result.affiliation).toEqual(
      expect.objectContaining({
        institutionId: institution.id,
        programId: program.id,
        curriculumId: curriculum.id,
      }),
    );
  });

  it('lists subject participation and upserts a plain subject relation', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const subject = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'subject',
      parentIds: ['44444444-4444-4444-8444-444444444444'],
    });
    const row = participation();

    store.listSubjectParticipationsForUser.mockResolvedValue(page([row]));
    store.findCatalogNodeById.mockResolvedValue(subject);
    store.upsertSubjectParticipation.mockImplementation((input) =>
      Promise.resolve({
        ...input,
        createdAt: now,
        updatedAt: now,
      }),
    );

    await expect(service.listSubjectParticipations('user-1')).resolves.toEqual({
      participations: [
        expect.objectContaining({ id: row.id, state: 'current' }),
      ],
      truncated: false,
      limit: ACADEMIC_PARTICIPATION_VISIBLE_LIMIT,
    });

    const result = await service.upsertSubjectParticipation(
      'user-1',
      subject.id,
      { state: 'planned', periodLabel: '2027 S1' },
    );

    expect(result.participation).toEqual(
      expect.objectContaining({
        subjectId: subject.id,
        state: 'planned',
        periodLabel: '2027 S1',
      }),
    );
  });

  it('returns null current context and rejects a withdrawn affiliation', async () => {
    const store = createStore();
    const service = new AcademicService(store);

    store.getCurrentContext.mockResolvedValue(null);
    await expect(service.getCurrentContext('user-1')).resolves.toEqual({
      context: null,
    });

    store.findAffiliationById.mockResolvedValue(
      affiliation({ status: 'withdrawn' }),
    );

    await expect(
      service.setCurrentContext('user-1', {
        expectedRevision: 0,
        affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects current context participation owned by another account', async () => {
    const store = createStore();
    const service = new AcademicService(store);

    store.findAffiliationById.mockResolvedValue(affiliation());
    store.findSubjectParticipationById.mockResolvedValue(
      participation({ userId: 'other-user' }),
    );

    await expect(
      service.setCurrentContext('user-1', {
        expectedRevision: 0,
        affiliationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        subjectParticipationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects current context when subject does not belong to the affiliation', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const row = affiliation();

    store.findAffiliationById.mockResolvedValue(row);
    store.findSubjectParticipationById.mockResolvedValue(participation());
    store.findCatalogNodesByIds.mockResolvedValue([]);

    await expect(
      service.setCurrentContext('user-1', {
        expectedRevision: 0,
        affiliationId: row.id,
        subjectParticipationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('validates proposal parents without canonicalizing the proposal', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const curriculum = catalogNode({
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'curriculum',
    });

    store.findCatalogNodesByIds.mockResolvedValue([curriculum]);
    store.createProposal.mockImplementation((input) =>
      Promise.resolve({
        ...input,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const proposalResult = await service.createProposal('user-1', {
      kind: 'subject',
      proposedName: 'Materia propuesta',
      parentIds: [curriculum.id],
    });
    expect(proposalResult.proposal.status).toBe('pending');

    store.findCatalogNodesByIds.mockResolvedValue([]);
    await expect(
      service.createProposal('user-1', {
        kind: 'subject',
        proposedName: 'Sin padre válido',
        parentIds: [curriculum.id],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects missing redirect targets and over-deep redirect chains', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const broken = catalogNode({
      status: 'merged',
      redirectToId: undefined,
    });
    store.findCatalogNodeById.mockResolvedValue(broken);

    await expect(service.getCatalogNode(broken.id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        catalogNode({
          id,
          status: 'merged',
          redirectToId: id + '-next',
        }),
      ),
    );

    await expect(service.getCatalogNode('start')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects wrong node kinds and invalid parent cardinality', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const country = catalogNode();
    const institutionA = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
      parentIds: [country.id],
    });
    const institutionB = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'institution',
      parentIds: [country.id],
    });

    store.findCatalogNodeById.mockResolvedValue(country);
    await expect(
      service.createAffiliation('user-1', {
        institutionId: country.id,
        status: 'active',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    store.findCatalogNodesByIds.mockResolvedValue([institutionA, institutionB]);

    await expect(
      service.createCatalogNode('admin-1', {
        kind: 'program',
        name: 'Impossible',
        parentIds: [institutionA.id, institutionB.id],
        provenance: {
          authorityTier: 'C',
          sourceKey: 'curated',
          sourceUrl: 'https://example.test/source',
        },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('requires parents for every non-country node and forbids parents for country', async () => {
    const store = createStore();
    const service = new AcademicService(store);

    await expect(
      service.createCatalogNode('admin-1', {
        kind: 'institution',
        name: 'No parent',
        provenance: {
          authorityTier: 'C',
          sourceKey: 'curated',
          sourceUrl: 'https://example.test/source',
        },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      service.createCatalogNode('admin-1', {
        kind: 'country',
        name: 'Country with parent',
        parentIds: ['11111111-1111-4111-8111-111111111111'],
        provenance: {
          authorityTier: 'C',
          sourceKey: 'curated',
          sourceUrl: 'https://example.test/source',
        },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('prevents provenance updates from stealing another source identity', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const country = catalogNode();
    const existing = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
      parentIds: [country.id],
    });
    const other = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'institution',
      parentIds: [country.id],
    });

    store.findCatalogNodeById.mockResolvedValue(existing);
    store.findCatalogNodesByIds.mockResolvedValue([country]);
    store.findCatalogNodeBySourceIdentity.mockResolvedValue(other);

    await expect(
      service.updateCatalogNode('admin-1', existing.id, {
        expectedRevision: 1,
        provenance: {
          authorityTier: 'A',
          sourceKey: 'siu',
          sourceUrl: 'https://example.test/siu',
          externalId: 'occupied',
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(store.updateCatalogNode).not.toHaveBeenCalled();
  });

  it('lists proposals and requires canonical targets for resolution outcomes', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const proposal = {
      id: '99999999-9999-4999-8999-999999999999',
      userId: 'user-1',
      kind: 'subject' as const,
      proposedName: 'Materia propuesta',
      parentIds: [],
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
    };

    store.listProposals.mockResolvedValue([proposal]);
    const list = await service.listProposals('pending', 20);
    expect(list.proposals.map((item) => item.id)).toEqual([proposal.id]);

    store.findProposalById.mockResolvedValue(proposal);

    await expect(
      service.reviewProposal('admin-1', proposal.id, {
        status: 'accepted',
        reason: 'Validada con plan oficial',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      service.reviewProposal('admin-1', proposal.id, {
        status: 'rejected',
        reason: 'No corresponde',
        canonicalTargetId: '55555555-5555-4555-8555-555555555555',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('reviews a proposal exactly once and maps it to a same-kind canonical node', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const proposal = {
      id: '99999999-9999-4999-8999-999999999999',
      userId: 'user-1',
      kind: 'subject' as const,
      proposedName: 'Bases de Datos',
      parentIds: [],
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
    };
    const target = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'subject',
      name: 'Base de Datos',
      normalizedName: 'base de datos',
    });

    store.findProposalById.mockResolvedValue(proposal);
    store.findCatalogNodeById.mockResolvedValue(target);
    store.reviewProposal.mockResolvedValue({
      ...proposal,
      status: 'duplicate',
      reviewedByUserId: 'admin-1',
      reviewReason: 'Misma materia canónica',
      canonicalTargetId: target.id,
      reviewedAt: now,
      updatedAt: now,
    });

    const result = await service.reviewProposal('admin-1', proposal.id, {
      status: 'duplicate',
      reason: '  Misma materia canónica  ',
      canonicalTargetId: target.id,
    });

    expect(result.proposal.status).toBe('duplicate');
    expect(result.proposal.canonicalTargetId).toBe(target.id);
    expect(store.reviewProposal).toHaveBeenCalledWith(
      proposal.id,
      'admin-1',
      'duplicate',
      'Misma materia canónica',
      target.id,
    );
    expect(store.appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'academic.proposal.reviewed',
        targetId: proposal.id,
      }),
    );

    store.reviewProposal.mockResolvedValue(null);
    await expect(
      service.reviewProposal('admin-1', proposal.id, {
        status: 'duplicate',
        reason: 'Carrera concurrente',
        canonicalTargetId: target.id,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects proposal review targets of a different academic kind', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const proposal = {
      id: '99999999-9999-4999-8999-999999999999',
      userId: 'user-1',
      kind: 'subject' as const,
      proposedName: 'Materia',
      parentIds: [],
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
    };
    const program = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'program',
    });

    store.findProposalById.mockResolvedValue(proposal);
    store.findCatalogNodeById.mockResolvedValue(program);

    await expect(
      service.reviewProposal('admin-1', proposal.id, {
        status: 'superseded',
        reason: 'Target incorrecto',
        canonicalTargetId: program.id,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('maps persistence-level source identity races to the stable conflict contract', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const country = catalogNode();

    store.findCatalogNodesByIds.mockResolvedValue([country]);
    store.findCatalogNodeBySourceIdentity.mockResolvedValue(null);
    store.createCatalogNode.mockRejectedValue(
      new AcademicSourceIdentityConflictError(),
    );

    try {
      await service.createCatalogNode('admin-1', {
        kind: 'institution',
        name: 'Concurrent institution',
        parentIds: [country.id],
        provenance: {
          authorityTier: 'A',
          sourceKey: 'siu',
          sourceUrl: 'https://example.test/siu',
          externalId: 'concurrent-id',
        },
      });
      throw new Error('Expected source identity conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      if (!(error instanceof ConflictException)) throw error;
      expect(error.getResponse()).toEqual({
        code: 'ACADEMIC_SOURCE_IDENTITY_EXISTS',
        message: 'Academic source identity already exists',
      });
    }
  });

  it('resolves a canonical organization scope across optional academic levels', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const institution = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
      parentIds: ['11111111-1111-4111-8111-111111111111'],
    });
    const campus = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'campus',
      parentIds: [institution.id],
    });
    const academicUnit = catalogNode({
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'academic_unit',
      parentIds: [campus.id],
    });
    const program = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'program',
      parentIds: [academicUnit.id],
    });
    const nodes = [institution, campus, academicUnit, program];

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(nodes.find((node) => node.id === id) ?? null),
    );

    const scope = await service.resolveOrganizationScope({
      institutionId: institution.id,
      campusId: campus.id,
      academicUnitId: academicUnit.id,
      programId: program.id,
    });

    expect(scope).toEqual({
      institutionId: institution.id,
      campusId: campus.id,
      academicUnitId: academicUnit.id,
      programId: program.id,
    });
  });

  it('keeps organization scope minimal and rejects nodes from another institution', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const institution = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const foreignInstitution = catalogNode({
      id: '66666666-6666-4666-8666-666666666666',
      kind: 'institution',
    });
    const foreignProgram = catalogNode({
      id: '77777777-7777-4777-8777-777777777777',
      kind: 'program',
      parentIds: [foreignInstitution.id],
    });
    const nodes = [institution, foreignInstitution, foreignProgram];

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(nodes.find((node) => node.id === id) ?? null),
    );

    await expect(
      service.resolveOrganizationScope({
        institutionId: institution.id,
        programId: foreignProgram.id,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      service.resolveOrganizationScope({
        institutionId: institution.id,
      }),
    ).resolves.toEqual({
      institutionId: institution.id,
      campusId: null,
      academicUnitId: null,
      programId: null,
    });
  });

  it('fails closed when reverse redirect ancestry exceeds the depth budget', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const root = catalogNode({
      id: 'root-node',
      kind: 'institution',
    });
    store.findCatalogNodeById.mockResolvedValue(root);

    let level = 0;
    store.findDirectRedirectSources.mockImplementation((targetIds) => {
      const current = targetIds[0];
      if (!current) return Promise.resolve(page([]));

      level += 1;
      return Promise.resolve(
        page([
          catalogNode({
            id: `reverse-${level}`,
            kind: 'institution',
            status: 'merged',
            redirectToId: current,
          }),
        ]),
      );
    });

    const error = await rejectedConflict(
      service.listChildren(root.id, 'program', 25),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_REDIRECT_TOO_DEEP',
    });
    expect(store.searchCatalog.mock.calls).toHaveLength(0);
  });

  it('rejects an indirect self merge through an alias that resolves to source', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const source = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const alias = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'institution',
      status: 'merged',
      redirectToId: source.id,
    });
    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        id === alias.id ? alias : id === source.id ? source : null,
      ),
    );

    const error = await rejectedUnprocessable(
      service.mergeCatalogNode('admin-1', source.id, alias.id, 1),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_MERGE_SELF',
    });
    expect(store.updateCatalogNode.mock.calls).toHaveLength(0);
  });

  it('traverses reverse redirects with one bounded query per level', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const target = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const source = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'institution',
      status: 'merged',
      redirectToId: target.id,
    });
    const legacy = catalogNode({
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'institution',
      status: 'merged',
      redirectToId: source.id,
    });

    store.findCatalogNodeById.mockResolvedValue(target);
    store.findDirectRedirectSources.mockImplementation((targetIds) => {
      if (targetIds.includes(target.id)) return Promise.resolve(page([source]));
      if (targetIds.includes(source.id)) return Promise.resolve(page([legacy]));
      return Promise.resolve(page([]));
    });
    store.searchCatalog.mockResolvedValue({ items: [], hasMore: false });

    await service.listChildren(target.id, 'program', 25);

    expect(store.findDirectRedirectSources.mock.calls).toEqual([
      [[target.id], ACADEMIC_REDIRECT_IDENTITY_LIMIT - 1],
      [[source.id], ACADEMIC_REDIRECT_IDENTITY_LIMIT - 2],
      [[legacy.id], ACADEMIC_REDIRECT_IDENTITY_LIMIT - 3],
    ]);
    expect(store.searchCatalog).toHaveBeenCalledWith({
      kind: 'program',
      parentIds: [target.id, source.id, legacy.id],
      limit: 25,
    });
  });

  it('fails closed when a redirect level exceeds the identity budget', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const target = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    store.findCatalogNodeById.mockResolvedValue(target);
    store.findDirectRedirectSources.mockResolvedValue({
      items: [],
      hasMore: true,
    });

    const error = await rejectedConflict(
      service.listChildren(target.id, 'program', 25),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_REDIRECT_FANOUT_OVERFLOW',
      limit: ACADEMIC_REDIRECT_IDENTITY_LIMIT,
    });
    expect(store.searchCatalog.mock.calls).toHaveLength(0);
  });

  it('rejects a merge whose combined canonical identity set exceeds the budget', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const source = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
    });
    const target = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'institution',
    });
    const sourceAliases = Array.from({ length: 128 }, (_, index) =>
      catalogNode({
        id: `source-alias-${index}`,
        kind: 'institution',
        status: 'merged',
        redirectToId: source.id,
      }),
    );
    const targetAliases = Array.from({ length: 128 }, (_, index) =>
      catalogNode({
        id: `target-alias-${index}`,
        kind: 'institution',
        status: 'merged',
        redirectToId: target.id,
      }),
    );

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        id === source.id ? source : id === target.id ? target : null,
      ),
    );
    store.findDirectRedirectSources.mockImplementation((targetIds) => {
      if (targetIds.includes(source.id)) {
        return Promise.resolve(page(sourceAliases));
      }
      if (targetIds.includes(target.id)) {
        return Promise.resolve(page(targetAliases));
      }
      return Promise.resolve(page([]));
    });

    const error = await rejectedConflict(
      service.mergeCatalogNode('admin-1', source.id, target.id, 1),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'ACADEMIC_REDIRECT_FANOUT_OVERFLOW',
    });
    expect(store.updateCatalogNode.mock.calls).toHaveLength(0);
  });

  it('keeps children and affiliation projections canonical after a parent merge', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const target = catalogNode({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'institution',
      name: 'Canonical institution',
      normalizedName: 'canonical institution',
    });
    const source = catalogNode({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'institution',
      status: 'merged',
      redirectToId: target.id,
    });
    const child = catalogNode({
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'program',
      parentIds: [source.id],
    });
    const row = affiliation({
      institutionId: source.id,
      programId: child.id,
      curriculumId: undefined,
    });

    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        id === target.id
          ? target
          : id === source.id
            ? source
            : id === child.id
              ? child
              : null,
      ),
    );
    store.findDirectRedirectSources.mockImplementation((targetIds) =>
      Promise.resolve(page(targetIds.includes(target.id) ? [source] : [])),
    );
    store.searchCatalog.mockResolvedValue({ items: [child], hasMore: false });
    store.listAffiliationsForUser.mockResolvedValue(page([row]));

    const children = await service.listChildren(target.id, 'program', 25);
    expect(children.items.map((item) => item.id)).toEqual([child.id]);
    expect(store.searchCatalog).toHaveBeenCalledWith({
      kind: 'program',
      parentIds: [target.id, source.id],
      limit: 25,
    });

    const affiliations = await service.listAffiliations('user-1');
    expect(affiliations.affiliations[0]?.institutionId).toBe(target.id);
    expect(affiliations.affiliations[0]?.programId).toBe(child.id);
  });
});
