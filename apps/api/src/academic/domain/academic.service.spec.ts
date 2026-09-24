import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  AcademicSourceIdentityConflictError,
  type AcademicStore,
} from './academic.store';
import { AcademicService } from './academic.service';
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

function mockFn<T extends (...args: any[]) => any>() {
  return jest.fn<ReturnType<T>, Parameters<T>>();
}

function createStore() {
  const findDirectRedirectSources =
    mockFn<AcademicStore['findDirectRedirectSources']>();
  findDirectRedirectSources.mockResolvedValue([]);

  const findCatalogNodesByIds =
    mockFn<AcademicStore['findCatalogNodesByIds']>();
  findCatalogNodesByIds.mockResolvedValue([]);

  const findCatalogNodeById = mockFn<AcademicStore['findCatalogNodeById']>();
  findCatalogNodeById.mockImplementation(async (id) => {
    const rows = await findCatalogNodesByIds([id]);
    return rows[0] ?? null;
  });

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
    createAffiliation: mockFn<AcademicStore['createAffiliation']>(),
    findAffiliationById: mockFn<AcademicStore['findAffiliationById']>(),
    listAffiliationsForUser: mockFn<AcademicStore['listAffiliationsForUser']>(),
    updateAffiliationStatus: mockFn<AcademicStore['updateAffiliationStatus']>(),
    updateAffiliationRoles: mockFn<AcademicStore['updateAffiliationRoles']>(),
    transitionAffiliationToAlumni:
      mockFn<AcademicStore['transitionAffiliationToAlumni']>(),
    upsertSubjectParticipation:
      mockFn<AcademicStore['upsertSubjectParticipation']>(),
    findSubjectParticipationById:
      mockFn<AcademicStore['findSubjectParticipationById']>(),
    listSubjectParticipationsForUser:
      mockFn<AcademicStore['listSubjectParticipationsForUser']>(),
    transitionSubjectParticipationStates:
      mockFn<AcademicStore['transitionSubjectParticipationStates']>(),
    getCurrentContext: mockFn<AcademicStore['getCurrentContext']>(),
    setCurrentContext: mockFn<AcademicStore['setCurrentContext']>(),
    upsertAcademicFollow: mockFn<AcademicStore['upsertAcademicFollow']>(),
    listAcademicFollows: mockFn<AcademicStore['listAcademicFollows']>(),
    removeAcademicFollows: mockFn<AcademicStore['removeAcademicFollows']>(),
    createProposal: mockFn<AcademicStore['createProposal']>(),
    findProposalById: mockFn<AcademicStore['findProposalById']>(),
    listProposals: mockFn<AcademicStore['listProposals']>(),
    reviewProposal: mockFn<AcademicStore['reviewProposal']>(),
    appendAuditEvent: mockFn<AcademicStore['appendAuditEvent']>(),
  };
}

describe('AcademicService', () => {
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

  it('persists a context only when affiliation and participation belong together', async () => {
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
    const part = participation();

    store.findAffiliationById.mockResolvedValue(row);
    store.findSubjectParticipationById.mockResolvedValue(part);
    store.findCatalogNodeById.mockImplementation((id) =>
      Promise.resolve(
        id === subject.id ? subject : id === curriculum.id ? curriculum : null,
      ),
    );
    store.setCurrentContext.mockImplementation((input) =>
      Promise.resolve({
        ...input,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const result = await service.setCurrentContext('user-1', {
      affiliationId: row.id,
      subjectParticipationId: part.id,
    });
    expect(result.context.affiliationId).toBe(row.id);
    expect(result.context.subjectParticipationId).toBe(part.id);
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
    store.listAffiliationsForUser.mockResolvedValue([created]);
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
    store.listSubjectParticipationsForUser.mockResolvedValue([row]);

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

  it('returns and updates current academic context without accepting withdrawn context', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const active = affiliation({ status: 'active' });
    const withdrawn = affiliation({ status: 'withdrawn' });

    store.getCurrentContext.mockResolvedValue({
      userId: 'user-1',
      affiliationId: active.id,
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
        affiliationId: withdrawn.id,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
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
    store.listAffiliationsForUser.mockResolvedValue([row]);
    store.findAffiliationById.mockResolvedValue(row);
    store.updateAffiliationStatus.mockResolvedValue({
      ...row,
      status: 'completed',
      endedOn: '2026',
    });

    await expect(service.listAffiliations('user-1')).resolves.toEqual({
      affiliations: [expect.objectContaining({ id: row.id, status: 'active' })],
    });

    const updateResult = await service.updateAffiliationStatus(
      'user-1',
      row.id,
      {
        status: 'completed',
        endedOn: '2026',
      },
    );
    expect(updateResult.affiliation.id).toBe(row.id);
    expect(updateResult.affiliation.status).toBe('completed');
    expect(updateResult.affiliation.endedOn).toBe('2026');

    store.updateAffiliationStatus.mockResolvedValueOnce(null);
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

    store.listSubjectParticipationsForUser.mockResolvedValue([row]);
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
    store.findDirectRedirectSources.mockImplementation((id) =>
      Promise.resolve(id === target.id ? [source] : []),
    );
    store.searchCatalog.mockResolvedValue({ items: [child], hasMore: false });
    store.listAffiliationsForUser.mockResolvedValue([row]);

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
