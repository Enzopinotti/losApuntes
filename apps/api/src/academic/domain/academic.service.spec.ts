import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AcademicStore } from './academic.store';
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

function createStore(): jest.Mocked<AcademicStore> {
  return {
    findCatalogNodeById: jest.fn(),
    findCatalogNodesByIds: jest.fn(),
    findCatalogNodeBySourceIdentity: jest.fn(),
    searchCatalog: jest.fn(),
    createCatalogNode: jest.fn(),
    updateCatalogNode: jest.fn(),
    createAffiliation: jest.fn(),
    findAffiliationById: jest.fn(),
    listAffiliationsForUser: jest.fn(),
    updateAffiliationStatus: jest.fn(),
    upsertSubjectParticipation: jest.fn(),
    findSubjectParticipationById: jest.fn(),
    listSubjectParticipationsForUser: jest.fn(),
    getCurrentContext: jest.fn(),
    setCurrentContext: jest.fn(),
    createProposal: jest.fn(),
    appendAuditEvent: jest.fn(),
  };
}

describe('AcademicService', () => {
  it('creates canonical nodes with normalized aliases and auditable provenance', async () => {
    const store = createStore();
    const service = new AcademicService(store);
    const country = catalogNode();

    store.findCatalogNodesByIds.mockResolvedValue([country]);
    store.findCatalogNodeBySourceIdentity.mockResolvedValue(null);
    store.createCatalogNode.mockImplementation(async (input) => ({
      ...input,
      createdAt: now,
      updatedAt: now,
    }));

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

    store.findCatalogNodesByIds.mockResolvedValue([planA, planB]);
    store.createCatalogNode.mockImplementation(async (input) => ({
      ...input,
      createdAt: now,
      updatedAt: now,
    }));

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

    store.findCatalogNodeById.mockImplementation(async (id) => {
      if (id === merged.id) return merged;
      if (id === target.id) return target;
      return null;
    });

    await expect(service.getCatalogNode(merged.id)).resolves.toEqual(
      expect.objectContaining({
        resolvedFromId: merged.id,
        node: expect.objectContaining({ id: target.id }),
      }),
    );

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

    store.findCatalogNodeById.mockImplementation(async (id) => {
      if (id === institution.id) return institution;
      if (id === foreignProgram.id) return foreignProgram;
      return null;
    });
    store.findCatalogNodesByIds.mockImplementation(async (ids) =>
      ids.includes(foreignProgram.id) ? [foreignProgram] : [],
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

    store.findCatalogNodeById.mockImplementation(async (id) => {
      if (id === subject.id) return subject;
      if (id === offering.id) return offering;
      return null;
    });
    store.findCatalogNodesByIds.mockImplementation(async (ids) => {
      if (ids.includes(offering.id)) return [offering];
      return [];
    });

    await expect(
      service.upsertSubjectParticipation('user-1', subject.id, {
        courseOfferingId: offering.id,
        state: 'current',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('keeps missing-data proposals provisional', async () => {
    const store = createStore();
    const service = new AcademicService(store);

    store.createProposal.mockImplementation(async (input) => ({
      ...input,
      createdAt: now,
      updatedAt: now,
    }));

    const result = await service.createProposal('user-1', {
      kind: 'subject',
      proposedName: '  Materia nueva ',
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
    const subject = catalogNode({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'subject',
      parentIds: [row.curriculumId!],
    });
    const part = participation();

    store.findAffiliationById.mockResolvedValue(row);
    store.findSubjectParticipationById.mockResolvedValue(part);
    store.findCatalogNodesByIds.mockImplementation(async (ids) =>
      ids.includes(subject.id) ? [subject] : [],
    );
    store.setCurrentContext.mockImplementation(async (input) => ({
      ...input,
      createdAt: now,
      updatedAt: now,
    }));

    await expect(
      service.setCurrentContext('user-1', {
        affiliationId: row.id,
        subjectParticipationId: part.id,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        context: expect.objectContaining({
          affiliationId: row.id,
          subjectParticipationId: part.id,
        }),
      }),
    );
  });
});
