import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  CreateAcademicAffiliationDto,
  CreateAcademicCatalogNodeDto,
  CreateAcademicProposalDto,
  SetAcademicContextDto,
  UpdateAcademicAffiliationStatusDto,
  UpdateAcademicCatalogNodeDto,
  UpsertSubjectParticipationDto,
} from '../dto/academic.dto';
import {
  ACADEMIC_STORE,
  type AcademicStore,
  type CatalogSearchCursor,
} from './academic.store';
import {
  ACADEMIC_PARENT_KINDS,
  type AcademicAffiliationRecord,
  type AcademicCatalogNodeRecord,
  type AcademicNodeKind,
} from './academic.types';

const MAX_REDIRECT_DEPTH = 8;
const MAX_ANCESTRY_DEPTH = 16;

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es-AR');
}

function cleanDisplayName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function encodeCursor(cursor: CatalogSearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value?: string): CatalogSearchCursor | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    if (
      typeof parsed.normalizedName !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      throw new Error('Invalid cursor shape');
    }

    return {
      normalizedName: parsed.normalizedName,
      id: parsed.id,
    };
  } catch {
    throw new UnprocessableEntityException({
      code: 'ACADEMIC_CURSOR_INVALID',
      message: 'Academic catalog cursor is invalid',
    });
  }
}

function publicNode(node: AcademicCatalogNodeRecord) {
  return {
    id: node.id,
    kind: node.kind,
    name: node.name,
    aliases: node.aliases,
    parentIds: node.parentIds,
    status: node.status,
    redirectToId: node.redirectToId,
    provenance: {
      authorityTier: node.provenance.authorityTier,
      sourceKey: node.provenance.sourceKey,
      sourceUrl: node.provenance.sourceUrl,
      externalId: node.provenance.externalId,
      sourceObservedName: node.provenance.sourceObservedName,
      sourceFingerprint: node.provenance.sourceFingerprint,
      verifiedAt: node.provenance.verifiedAt?.toISOString(),
    },
    revision: node.revision,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  };
}

@Injectable()
export class AcademicService {
  constructor(
    @Inject(ACADEMIC_STORE)
    private readonly store: AcademicStore,
  ) {}

  async searchCatalog(input: {
    kind?: AcademicNodeKind;
    q?: string;
    parentId?: string;
    limit: number;
    cursor?: string;
  }) {
    const result = await this.store.searchCatalog({
      kind: input.kind,
      q: input.q ? normalizeName(input.q) : undefined,
      parentId: input.parentId,
      limit: input.limit,
      after: decodeCursor(input.cursor),
    });
    const last = result.items.at(-1);

    return {
      items: result.items.map(publicNode),
      nextCursor:
        result.hasMore && last
          ? encodeCursor({
              normalizedName: last.normalizedName,
              id: last.id,
            })
          : null,
    };
  }

  async getCatalogNode(id: string) {
    const resolved = await this.resolveNode(id);
    return {
      node: publicNode(resolved.node),
      resolvedFromId: resolved.resolvedFromId,
    };
  }

  async listChildren(id: string, kind?: AcademicNodeKind, limit = 50) {
    const resolved = await this.resolveNode(id);
    const result = await this.store.searchCatalog({
      kind,
      parentId: resolved.node.id,
      limit,
    });

    return {
      parent: publicNode(resolved.node),
      items: result.items.map(publicNode),
      truncated: result.hasMore,
    };
  }

  async createCatalogNode(
    actorUserId: string,
    dto: CreateAcademicCatalogNodeDto,
  ) {
    const parentIds = uniqueStrings(dto.parentIds ?? []);
    await this.assertParentKinds(dto.kind, parentIds);

    if (dto.provenance.externalId) {
      const existing = await this.store.findCatalogNodeBySourceIdentity(
        dto.provenance.sourceKey,
        dto.provenance.externalId,
      );

      if (existing) {
        throw new ConflictException({
          code: 'ACADEMIC_SOURCE_IDENTITY_EXISTS',
          message: 'Academic source identity already exists',
        });
      }
    }

    const name = cleanDisplayName(dto.name);
    const aliases = uniqueStrings(
      (dto.aliases ?? [])
        .map(cleanDisplayName)
        .filter((alias) => normalizeName(alias) !== normalizeName(name)),
    );

    const created = await this.store.createCatalogNode({
      id: randomUUID(),
      kind: dto.kind,
      name,
      normalizedName: normalizeName(name),
      aliases,
      normalizedAliases: aliases.map(normalizeName),
      parentIds,
      status: 'active',
      provenance: {
        ...dto.provenance,
        verifiedAt: dto.provenance.verifiedAt
          ? new Date(dto.provenance.verifiedAt)
          : undefined,
      },
      revision: 1,
    });

    await this.audit('academic.catalog.created', actorUserId, created.id, {
      kind: created.kind,
      revision: created.revision,
    });

    return { node: publicNode(created) };
  }

  async updateCatalogNode(
    actorUserId: string,
    id: string,
    dto: UpdateAcademicCatalogNodeDto,
  ) {
    const existing = await this.store.findCatalogNodeById(id);
    if (!existing) this.notFound();

    if (existing.status === 'merged') {
      throw new ConflictException({
        code: 'ACADEMIC_NODE_MERGED',
        message: 'Merged academic nodes are immutable',
      });
    }

    const parentIds =
      dto.parentIds === undefined
        ? existing.parentIds
        : uniqueStrings(dto.parentIds);

    await this.assertParentKinds(existing.kind, parentIds);

    const name =
      dto.name === undefined ? existing.name : cleanDisplayName(dto.name);
    const aliases =
      dto.aliases === undefined
        ? existing.aliases
        : uniqueStrings(
            dto.aliases
              .map(cleanDisplayName)
              .filter((alias) => normalizeName(alias) !== normalizeName(name)),
          );

    const updated = await this.store.updateCatalogNode(
      id,
      dto.expectedRevision,
      {
        ...(dto.name === undefined
          ? {}
          : { name, normalizedName: normalizeName(name) }),
        ...(dto.aliases === undefined
          ? {}
          : {
              aliases,
              normalizedAliases: aliases.map(normalizeName),
            }),
        ...(dto.parentIds === undefined ? {} : { parentIds }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.provenance === undefined
          ? {}
          : {
              provenance: {
                ...dto.provenance,
                verifiedAt: dto.provenance.verifiedAt
                  ? new Date(dto.provenance.verifiedAt)
                  : undefined,
              },
            }),
      },
    );

    if (!updated) {
      throw new ConflictException({
        code: 'ACADEMIC_REVISION_CONFLICT',
        message: 'Academic catalog node changed concurrently',
      });
    }

    await this.audit('academic.catalog.updated', actorUserId, id, {
      revision: updated.revision,
    });

    return { node: publicNode(updated) };
  }

  async mergeCatalogNode(
    actorUserId: string,
    sourceId: string,
    targetId: string,
    expectedRevision: number,
  ) {
    if (sourceId === targetId) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_MERGE_SELF',
        message: 'Academic node cannot be merged into itself',
      });
    }

    const source = await this.store.findCatalogNodeById(sourceId);
    const target = await this.resolveNode(targetId);

    if (!source) this.notFound();
    if (source.status === 'merged') {
      throw new ConflictException({
        code: 'ACADEMIC_NODE_MERGED',
        message: 'Academic node is already merged',
      });
    }
    if (source.kind !== target.node.kind) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_MERGE_KIND_MISMATCH',
        message: 'Only academic nodes of the same kind can be merged',
      });
    }

    const updated = await this.store.updateCatalogNode(
      source.id,
      expectedRevision,
      {
        status: 'merged',
        redirectToId: target.node.id,
      },
    );

    if (!updated) {
      throw new ConflictException({
        code: 'ACADEMIC_REVISION_CONFLICT',
        message: 'Academic catalog node changed concurrently',
      });
    }

    await this.audit('academic.catalog.merged', actorUserId, source.id, {
      targetId: target.node.id,
      revision: updated.revision,
    });

    return {
      source: publicNode(updated),
      target: publicNode(target.node),
    };
  }

  async listAffiliations(userId: string) {
    return {
      affiliations: (await this.store.listAffiliationsForUser(userId)).map(
        (row) => this.publicAffiliation(row),
      ),
    };
  }

  async createAffiliation(userId: string, dto: CreateAcademicAffiliationDto) {
    const institution = await this.requireKind(
      dto.institutionId,
      'institution',
    );

    const contextualIds = [
      dto.campusId,
      dto.academicUnitId,
      dto.programId,
      dto.curriculumId,
    ].filter((value): value is string => Boolean(value));

    for (const id of contextualIds) {
      if (!(await this.isDescendantOf(id, institution.id))) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_CONTEXT_MISMATCH',
          message: 'Academic affiliation nodes do not share one institution',
        });
      }
    }

    if (dto.campusId) await this.requireKind(dto.campusId, 'campus');
    if (dto.academicUnitId)
      await this.requireKind(dto.academicUnitId, 'academic_unit');
    if (dto.programId) await this.requireKind(dto.programId, 'program');
    if (dto.curriculumId) {
      const curriculum = await this.requireKind(dto.curriculumId, 'curriculum');
      if (
        dto.programId &&
        !(await this.isDescendantOf(curriculum.id, dto.programId))
      ) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_CONTEXT_MISMATCH',
          message: 'Curriculum does not belong to the selected program',
        });
      }
    }

    const created = await this.store.createAffiliation({
      id: randomUUID(),
      userId,
      institutionId: institution.id,
      campusId: dto.campusId,
      academicUnitId: dto.academicUnitId,
      programId: dto.programId,
      curriculumId: dto.curriculumId,
      status: dto.status,
      startedOn: dto.startedOn,
      endedOn: dto.endedOn,
    });

    await this.audit('academic.affiliation.created', userId, created.id, {
      status: created.status,
    });

    return { affiliation: this.publicAffiliation(created) };
  }

  async updateAffiliationStatus(
    userId: string,
    id: string,
    dto: UpdateAcademicAffiliationStatusDto,
  ) {
    const updated = await this.store.updateAffiliationStatus(
      userId,
      id,
      dto.status,
      dto.endedOn,
    );
    if (!updated) this.notFound();

    await this.audit('academic.affiliation.updated', userId, updated.id, {
      status: updated.status,
    });

    return { affiliation: this.publicAffiliation(updated) };
  }

  async listSubjectParticipations(userId: string) {
    return {
      participations: (
        await this.store.listSubjectParticipationsForUser(userId)
      ).map((row) => this.publicParticipation(row)),
    };
  }

  async upsertSubjectParticipation(
    userId: string,
    subjectId: string,
    dto: UpsertSubjectParticipationDto,
  ) {
    const subject = await this.requireKind(subjectId, 'subject');

    let offeringId: string | undefined;
    if (dto.courseOfferingId) {
      const offering = await this.requireKind(
        dto.courseOfferingId,
        'course_offering',
      );
      if (!(await this.isDescendantOf(offering.id, subject.id))) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_CONTEXT_MISMATCH',
          message: 'Course offering does not belong to the selected subject',
        });
      }
      offeringId = offering.id;
    }

    const row = await this.store.upsertSubjectParticipation({
      id: randomUUID(),
      userId,
      subjectId: subject.id,
      courseOfferingId: offeringId,
      state: dto.state,
      periodLabel: dto.periodLabel,
    });

    await this.audit(
      'academic.subject_participation.upserted',
      userId,
      row.id,
      { state: row.state },
    );

    return { participation: this.publicParticipation(row) };
  }

  async getCurrentContext(userId: string) {
    const context = await this.store.getCurrentContext(userId);
    return { context: context ? this.publicContext(context) : null };
  }

  async setCurrentContext(userId: string, dto: SetAcademicContextDto) {
    const affiliation = await this.store.findAffiliationById(dto.affiliationId);
    if (!affiliation || affiliation.userId !== userId) this.notFound();

    if (affiliation.status === 'withdrawn') {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_CONTEXT_INELIGIBLE',
        message: 'Withdrawn affiliation cannot be the current context',
      });
    }

    let participation:
      | Awaited<ReturnType<AcademicStore['findSubjectParticipationById']>>
      | undefined;

    if (dto.subjectParticipationId) {
      participation = await this.store.findSubjectParticipationById(
        dto.subjectParticipationId,
      );

      if (!participation || participation.userId !== userId) this.notFound();

      const anchorId =
        affiliation.curriculumId ??
        affiliation.programId ??
        affiliation.institutionId;

      if (!(await this.isDescendantOf(participation.subjectId, anchorId))) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_CONTEXT_MISMATCH',
          message:
            'Subject participation does not belong to the selected affiliation',
        });
      }
    }

    const context = await this.store.setCurrentContext({
      userId,
      affiliationId: affiliation.id,
      subjectParticipationId: participation?.id,
    });

    await this.audit('academic.context.updated', userId, userId, {
      affiliationId: affiliation.id,
    });

    return { context: this.publicContext(context) };
  }

  async createProposal(userId: string, dto: CreateAcademicProposalDto) {
    const parentIds = uniqueStrings(dto.parentIds ?? []);
    if (parentIds.length > 0) {
      const parents = await this.store.findCatalogNodesByIds(parentIds);
      if (parents.length !== parentIds.length) this.notFound();
    }

    const created = await this.store.createProposal({
      id: randomUUID(),
      userId,
      kind: dto.kind,
      proposedName: cleanDisplayName(dto.proposedName),
      parentIds,
      evidenceUrl: dto.evidenceUrl,
      notes: dto.notes?.trim(),
      status: 'pending',
    });

    await this.audit('academic.proposal.created', userId, created.id, {
      kind: created.kind,
    });

    return {
      proposal: {
        id: created.id,
        kind: created.kind,
        proposedName: created.proposedName,
        parentIds: created.parentIds,
        evidenceUrl: created.evidenceUrl,
        notes: created.notes,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      },
    };
  }

  private async resolveNode(id: string): Promise<{
    node: AcademicCatalogNodeRecord;
    resolvedFromId: string | null;
  }> {
    const originalId = id;
    const visited = new Set<string>();

    for (let depth = 0; depth < MAX_REDIRECT_DEPTH; depth += 1) {
      if (visited.has(id)) {
        throw new ConflictException({
          code: 'ACADEMIC_REDIRECT_LOOP',
          message: 'Academic catalog redirect loop detected',
        });
      }
      visited.add(id);

      const node = await this.store.findCatalogNodeById(id);
      if (!node) this.notFound();

      if (node.status !== 'merged') {
        return {
          node,
          resolvedFromId: node.id === originalId ? null : originalId,
        };
      }

      if (!node.redirectToId) {
        throw new ConflictException({
          code: 'ACADEMIC_REDIRECT_INVALID',
          message: 'Merged academic node has no redirect target',
        });
      }

      id = node.redirectToId;
    }

    throw new ConflictException({
      code: 'ACADEMIC_REDIRECT_TOO_DEEP',
      message: 'Academic catalog redirect chain is too deep',
    });
  }

  private async requireKind(
    id: string,
    expected: AcademicNodeKind,
  ): Promise<AcademicCatalogNodeRecord> {
    const { node } = await this.resolveNode(id);

    if (node.kind !== expected || node.status !== 'active') {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_NODE_KIND_INVALID',
        message: `Expected an active ${expected} academic node`,
      });
    }

    return node;
  }

  private async assertParentKinds(
    kind: AcademicNodeKind,
    parentIds: string[],
  ): Promise<void> {
    const allowed = ACADEMIC_PARENT_KINDS[kind];

    if (kind === 'country' && parentIds.length > 0) this.invalidParent();
    if (kind !== 'country' && parentIds.length === 0) this.invalidParent();

    const parents = await this.store.findCatalogNodesByIds(parentIds);
    if (parents.length !== parentIds.length) this.notFound();

    if (
      parents.some(
        (parent) =>
          parent.status !== 'active' || !allowed.includes(parent.kind),
      )
    ) {
      this.invalidParent();
    }

    if (parentIds.length > 1 && kind !== 'subject') {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_PARENT_CARDINALITY_INVALID',
        message: 'Only Subject may currently have multiple catalog parents',
      });
    }
  }

  private async isDescendantOf(
    candidateId: string,
    ancestorId: string,
  ): Promise<boolean> {
    if (candidateId === ancestorId) return true;

    let frontier = [candidateId];
    const visited = new Set<string>();

    for (let depth = 0; depth < MAX_ANCESTRY_DEPTH; depth += 1) {
      const ids = uniqueStrings(frontier).filter((id) => !visited.has(id));
      if (ids.length === 0) return false;
      ids.forEach((id) => visited.add(id));

      const nodes = await this.store.findCatalogNodesByIds(ids);
      const parentIds = uniqueStrings(nodes.flatMap((node) => node.parentIds));

      if (parentIds.includes(ancestorId)) return true;
      frontier = parentIds;
    }

    return false;
  }

  private publicAffiliation(row: AcademicAffiliationRecord) {
    return {
      id: row.id,
      institutionId: row.institutionId,
      campusId: row.campusId,
      academicUnitId: row.academicUnitId,
      programId: row.programId,
      curriculumId: row.curriculumId,
      status: row.status,
      startedOn: row.startedOn,
      endedOn: row.endedOn,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private publicParticipation(row: {
    id: string;
    subjectId: string;
    courseOfferingId?: string;
    state: string;
    periodLabel?: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      subjectId: row.subjectId,
      courseOfferingId: row.courseOfferingId,
      state: row.state,
      periodLabel: row.periodLabel,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private publicContext(row: {
    affiliationId: string;
    subjectParticipationId?: string;
    updatedAt: Date;
  }) {
    return {
      affiliationId: row.affiliationId,
      subjectParticipationId: row.subjectParticipationId,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async audit(
    event: Parameters<AcademicStore['appendAuditEvent']>[0]['event'],
    actorUserId: string,
    targetId: string,
    metadata?: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await this.store.appendAuditEvent({
      id: randomUUID(),
      event,
      actorUserId,
      targetId,
      metadata,
      createdAt: new Date(),
    });
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'ACADEMIC_NOT_FOUND',
      message: 'Academic entity was not found',
    });
  }

  private invalidParent(): never {
    throw new UnprocessableEntityException({
      code: 'ACADEMIC_PARENT_INVALID',
      message: 'Academic catalog parent is invalid for this node kind',
    });
  }
}
