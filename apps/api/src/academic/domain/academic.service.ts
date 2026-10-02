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
  ReviewAcademicProposalDto,
  SetAcademicContextDto,
  UpdateAcademicAffiliationStatusDto,
  UpdateAcademicCatalogNodeDto,
  UpsertSubjectParticipationDto,
} from '../dto/academic.dto';
import {
  ACADEMIC_AFFILIATION_DECISION_LIMIT,
  ACADEMIC_AFFILIATION_VISIBLE_LIMIT,
  ACADEMIC_PARTICIPATION_DECISION_LIMIT,
  ACADEMIC_PARTICIPATION_VISIBLE_LIMIT,
  requireCompleteAcademicPage,
} from './academic-bounds';
import {
  CURRENT_SUBJECT_PARTICIPATION_STATES,
  affiliationAllowsCurrentSubjectContext,
  effectiveAcademicRelationshipRoles,
  isCurrentSubjectParticipationState,
  relationshipRolesCompatible,
} from './academic-lifecycle.helpers';
import {
  ACADEMIC_STORE,
  AcademicSourceIdentityConflictError,
  type AcademicStore,
  type CatalogSearchCursor,
} from './academic.store';
import {
  ACADEMIC_PARENT_KINDS,
  type AcademicAffiliationRecord,
  type AcademicCatalogNodeRecord,
  type AcademicCatalogProposalRecord,
  type AcademicNodeKind,
  type AcademicProposalStatus,
} from './academic.types';

const MAX_REDIRECT_DEPTH = 8;
export const ACADEMIC_REDIRECT_IDENTITY_LIMIT = 256;
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
    const parentIds = input.parentId
      ? await this.catalogIdentitySet(input.parentId)
      : undefined;
    const result = await this.store.searchCatalog({
      kind: input.kind,
      q: input.q ? normalizeName(input.q) : undefined,
      parentIds,
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
    const parentIds = await this.catalogIdentitySet(resolved.node.id);
    const result = await this.store.searchCatalog({
      kind,
      parentIds,
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
    const parentIds = await this.canonicalParentIds(
      dto.kind,
      uniqueStrings(dto.parentIds ?? []),
    );

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

    const created = await this.withSourceIdentityConflict(() =>
      this.store.runAtomically(async () => {
        const node = await this.store.createCatalogNode({
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

        await this.audit('academic.catalog.created', actorUserId, node.id, {
          kind: node.kind,
          revision: node.revision,
        });

        return node;
      }),
    );

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

    const parentIds = await this.canonicalParentIds(
      existing.kind,
      dto.parentIds === undefined
        ? existing.parentIds
        : uniqueStrings(dto.parentIds),
    );

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

    if (dto.provenance?.externalId) {
      const sourceIdentity = await this.store.findCatalogNodeBySourceIdentity(
        dto.provenance.sourceKey,
        dto.provenance.externalId,
      );

      if (sourceIdentity && sourceIdentity.id !== id) {
        throw new ConflictException({
          code: 'ACADEMIC_SOURCE_IDENTITY_EXISTS',
          message: 'Academic source identity already exists',
        });
      }
    }

    const updated = await this.withSourceIdentityConflict(() =>
      this.store.runAtomically(async () => {
        const node = await this.store.updateCatalogNode(
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

        if (!node) {
          throw new ConflictException({
            code: 'ACADEMIC_REVISION_CONFLICT',
            message: 'Academic catalog node changed concurrently',
          });
        }

        await this.audit('academic.catalog.updated', actorUserId, id, {
          revision: node.revision,
        });

        return node;
      }),
    );

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
    if (source.id === target.node.id) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_MERGE_SELF',
        message:
          'Academic node cannot be merged into its own canonical identity',
      });
    }
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

    const [sourceIdentities, targetIdentities] = await Promise.all([
      this.catalogIdentitySet(source.id),
      this.catalogIdentitySet(target.node.id),
    ]);
    if (
      uniqueStrings([...sourceIdentities, ...targetIdentities]).length >
      ACADEMIC_REDIRECT_IDENTITY_LIMIT
    ) {
      this.redirectFanoutOverflow();
    }

    const merged = await this.store.runAtomically(async () => {
      const canonicalTarget = await this.store.bumpCatalogNodeRevision(
        target.node.id,
        target.node.revision,
      );

      if (!canonicalTarget) {
        throw new ConflictException({
          code: 'ACADEMIC_REVISION_CONFLICT',
          message: 'Academic catalog node changed concurrently',
        });
      }

      const node = await this.store.updateCatalogNode(
        source.id,
        expectedRevision,
        {
          status: 'merged',
          redirectToId: canonicalTarget.id,
        },
      );

      if (!node) {
        throw new ConflictException({
          code: 'ACADEMIC_REVISION_CONFLICT',
          message: 'Academic catalog node changed concurrently',
        });
      }

      await this.audit('academic.catalog.merged', actorUserId, source.id, {
        targetId: canonicalTarget.id,
        revision: node.revision,
        targetRevision: canonicalTarget.revision,
      });

      return {
        source: node,
        target: canonicalTarget,
      };
    });

    return {
      source: publicNode(merged.source),
      target: publicNode(merged.target),
    };
  }

  async listAffiliations(userId: string) {
    const page = await this.store.listAffiliationsForUser({
      userId,
      limit: ACADEMIC_AFFILIATION_VISIBLE_LIMIT,
    });

    return {
      affiliations: await Promise.all(
        page.items.map((row) => this.publicAffiliation(row)),
      ),
      truncated: page.hasMore,
      limit: ACADEMIC_AFFILIATION_VISIBLE_LIMIT,
    };
  }

  async createAffiliation(userId: string, dto: CreateAcademicAffiliationDto) {
    const institution = await this.requireKind(
      dto.institutionId,
      'institution',
    );
    const campus = dto.campusId
      ? await this.requireKind(dto.campusId, 'campus')
      : undefined;
    const academicUnit = dto.academicUnitId
      ? await this.requireKind(dto.academicUnitId, 'academic_unit')
      : undefined;
    const program = dto.programId
      ? await this.requireKind(dto.programId, 'program')
      : undefined;
    const curriculum = dto.curriculumId
      ? await this.requireKind(dto.curriculumId, 'curriculum')
      : undefined;

    const contextualIds = [
      campus?.id,
      academicUnit?.id,
      program?.id,
      curriculum?.id,
    ].filter((value): value is string => Boolean(value));

    for (const contextualId of contextualIds) {
      if (!(await this.isDescendantOf(contextualId, institution.id))) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_CONTEXT_MISMATCH',
          message: 'Academic affiliation nodes do not share one institution',
        });
      }
    }

    if (
      curriculum &&
      program &&
      !(await this.isDescendantOf(curriculum.id, program.id))
    ) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_CONTEXT_MISMATCH',
        message: 'Curriculum does not belong to the selected program',
      });
    }

    const roles = effectiveAcademicRelationshipRoles(dto.status, dto.roles);

    if (!relationshipRolesCompatible(dto.status, roles)) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_AFFILIATION_ROLE_INVALID',
        message: 'Academic relationship roles conflict with affiliation status',
      });
    }

    const created = await this.store.runAtomically(async () => {
      const row = await this.store.createAffiliation({
        id: randomUUID(),
        userId,
        institutionId: institution.id,
        campusId: campus?.id,
        academicUnitId: academicUnit?.id,
        programId: program?.id,
        curriculumId: curriculum?.id,
        status: dto.status,
        roles,
        startedOn: dto.startedOn,
        endedOn: dto.endedOn,
      });

      await this.audit('academic.affiliation.created', userId, row.id, {
        status: row.status,
      });

      return row;
    });

    return { affiliation: await this.publicAffiliation(created) };
  }

  async updateAffiliationStatus(
    userId: string,
    id: string,
    dto: UpdateAcademicAffiliationStatusDto,
  ) {
    const existing = await this.store.findAffiliationById(id);
    if (!existing || existing.userId !== userId) this.notFound();

    if (dto.status === 'alumni') {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_GRADUATION_TRANSITION_REQUIRED',
        message: 'Use the graduation transition to enter alumni status',
      });
    }

    if (existing.status === 'alumni') {
      throw new ConflictException({
        code: 'ACADEMIC_ALUMNI_HISTORY_IMMUTABLE',
        message:
          'Alumni history is preserved; create a new affiliation instead',
      });
    }

    const roles = effectiveAcademicRelationshipRoles(
      existing.status,
      existing.roles,
    );
    if (!relationshipRolesCompatible(dto.status, roles)) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_AFFILIATION_ROLE_INVALID',
        message: 'Academic relationship roles conflict with affiliation status',
      });
    }

    const updated = await this.store.runAtomically(async () => {
      const row = await this.store.updateAffiliationStatus(
        userId,
        id,
        existing.status,
        dto.status,
        dto.endedOn,
      );
      if (!row) {
        throw new ConflictException({
          code: 'ACADEMIC_AFFILIATION_CONFLICT',
          message: 'Academic affiliation changed concurrently',
        });
      }

      await this.audit('academic.affiliation.updated', userId, row.id, {
        status: row.status,
      });

      return row;
    });

    return { affiliation: await this.publicAffiliation(updated) };
  }

  async listSubjectParticipations(userId: string, affiliationId?: string) {
    if (!affiliationId) {
      const page = await this.store.listSubjectParticipationsForUser({
        userId,
        limit: ACADEMIC_PARTICIPATION_VISIBLE_LIMIT,
      });

      return {
        participations: await Promise.all(
          page.items.map((row) => this.publicParticipation(row)),
        ),
        truncated: page.hasMore,
        limit: ACADEMIC_PARTICIPATION_VISIBLE_LIMIT,
      };
    }

    const affiliation = await this.store.findAffiliationById(affiliationId);
    if (!affiliation || affiliation.userId !== userId) this.notFound();

    if (!affiliationAllowsCurrentSubjectContext(affiliation.status)) {
      return {
        participations: [],
        truncated: false,
        limit: ACADEMIC_PARTICIPATION_VISIBLE_LIMIT,
      };
    }

    const inventory = requireCompleteAcademicPage(
      await this.store.listSubjectParticipationsForUser({
        userId,
        states: [...CURRENT_SUBJECT_PARTICIPATION_STATES],
        limit: ACADEMIC_PARTICIPATION_DECISION_LIMIT,
      }),
      'subject_participations',
    );
    const eligible = [];

    for (const row of inventory) {
      if (
        isCurrentSubjectParticipationState(row.state) &&
        (await this.participationBelongsToAffiliation(
          row.subjectId,
          affiliation,
        ))
      ) {
        eligible.push(row);
      }
    }

    const visible = eligible.slice(0, ACADEMIC_PARTICIPATION_VISIBLE_LIMIT);

    return {
      participations: await Promise.all(
        visible.map((row) => this.publicParticipation(row)),
      ),
      truncated: eligible.length > ACADEMIC_PARTICIPATION_VISIBLE_LIMIT,
      limit: ACADEMIC_PARTICIPATION_VISIBLE_LIMIT,
    };
  }

  async upsertSubjectParticipation(
    userId: string,
    subjectId: string,
    dto: UpsertSubjectParticipationDto,
  ) {
    const subject = await this.requireKind(subjectId, 'subject');

    if (dto.state === 'current') {
      const affiliations = requireCompleteAcademicPage(
        await this.store.listAffiliationsForUser({
          userId,
          statuses: ['active', 'paused'],
          limit: ACADEMIC_AFFILIATION_DECISION_LIMIT,
        }),
        'affiliations',
      );
      let eligible = false;

      for (const affiliation of affiliations) {
        if (
          await this.participationBelongsToAffiliation(subject.id, affiliation)
        ) {
          eligible = true;
          break;
        }
      }

      if (!eligible) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_CONTEXT_INELIGIBLE',
          message:
            'Current subject requires an active or paused academic affiliation',
        });
      }
    }

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

    const row = await this.store.runAtomically(async () => {
      const participation = await this.store.upsertSubjectParticipation({
        id: randomUUID(),
        userId,
        subjectId: subject.id,
        courseOfferingId: offeringId,
        state: dto.state,
        periodLabel: dto.periodLabel,
      });

      if (!isCurrentSubjectParticipationState(participation.state)) {
        const context = await this.store.getCurrentContext(userId);
        if (context?.subjectParticipationId === participation.id) {
          const cleared = await this.store.setCurrentContext(
            {
              userId,
              affiliationId: context.affiliationId,
            },
            context.revision,
          );

          if (!cleared) this.contextRevisionConflict();

          await this.audit('academic.context.updated', userId, userId, {
            affiliationId: cleared.affiliationId,
            revision: cleared.revision,
            reason: 'subject_participation_no_longer_current',
          });
        }
      }

      await this.audit(
        'academic.subject_participation.upserted',
        userId,
        participation.id,
        { state: participation.state },
      );

      return participation;
    });

    return { participation: await this.publicParticipation(row) };
  }

  async getCurrentContext(userId: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await this.store.runAtomically(async () => {
        const current = await this.store.getCurrentContext(userId);
        if (!current?.subjectParticipationId) {
          return { kind: 'settled' as const, context: current };
        }

        const [affiliation, participation] = await Promise.all([
          this.store.findAffiliationById(current.affiliationId),
          this.store.findSubjectParticipationById(
            current.subjectParticipationId,
          ),
        ]);

        const affiliationEligible =
          affiliation !== null &&
          affiliation.userId === userId &&
          affiliationAllowsCurrentSubjectContext(affiliation.status);
        const participationEligible =
          participation !== null &&
          participation.userId === userId &&
          isCurrentSubjectParticipationState(participation.state);
        const graphEligible =
          affiliationEligible &&
          participationEligible &&
          affiliation &&
          participation
            ? await this.participationBelongsToAffiliation(
                participation.subjectId,
                affiliation,
              )
            : false;

        if (affiliationEligible && participationEligible && graphEligible) {
          return { kind: 'settled' as const, context: current };
        }

        const cleared = await this.store.setCurrentContext(
          {
            userId,
            affiliationId: current.affiliationId,
          },
          current.revision,
        );
        if (!cleared) return { kind: 'retry' as const };

        await this.audit('academic.context.updated', userId, userId, {
          affiliationId: cleared.affiliationId,
          revision: cleared.revision,
          reason: 'stored_subject_context_no_longer_eligible',
        });

        return { kind: 'settled' as const, context: cleared };
      });

      if (result.kind === 'settled') {
        return {
          context: result.context ? this.publicContext(result.context) : null,
        };
      }
    }

    this.contextRevisionConflict();
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

    if (
      dto.subjectParticipationId &&
      !affiliationAllowsCurrentSubjectContext(affiliation.status)
    ) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_CONTEXT_INELIGIBLE',
        message:
          'Alumni/completed affiliation cannot carry current subject context',
      });
    }

    if (dto.subjectParticipationId) {
      participation = await this.store.findSubjectParticipationById(
        dto.subjectParticipationId,
      );

      if (!participation || participation.userId !== userId) this.notFound();

      if (!isCurrentSubjectParticipationState(participation.state)) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_CONTEXT_INELIGIBLE',
          message:
            'Only current subject participations can be selected as current context',
        });
      }

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

    const context = await this.store.runAtomically(async () => {
      const affiliationGuarded = await this.store.guardAcademicAffiliation(
        userId,
        affiliation.id,
        affiliation.status,
      );
      if (!affiliationGuarded) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_CONTEXT_INELIGIBLE',
          message: 'Academic affiliation changed while selecting context',
        });
      }

      if (participation) {
        const guarded = await this.store.guardCurrentSubjectParticipation(
          userId,
          participation.id,
        );
        if (!guarded) {
          throw new UnprocessableEntityException({
            code: 'ACADEMIC_CONTEXT_INELIGIBLE',
            message:
              'Only current subject participations can be selected as current context',
          });
        }
      }

      const current = await this.store.getCurrentContext(userId);
      const actualRevision = current?.revision ?? 0;

      if (actualRevision !== dto.expectedRevision) {
        this.contextRevisionConflict();
      }

      const updated = await this.store.setCurrentContext(
        {
          userId,
          affiliationId: affiliation.id,
          subjectParticipationId: participation?.id,
        },
        dto.expectedRevision,
      );

      if (!updated) this.contextRevisionConflict();

      await this.audit('academic.context.updated', userId, userId, {
        affiliationId: affiliation.id,
        revision: updated.revision,
      });

      return updated;
    });

    return { context: this.publicContext(context) };
  }

  async participationBelongsToAffiliation(
    subjectId: string,
    affiliation: AcademicAffiliationRecord,
  ): Promise<boolean> {
    const anchorId =
      affiliation.curriculumId ??
      affiliation.programId ??
      affiliation.institutionId;
    return this.isDescendantOf(subjectId, anchorId);
  }

  async resolveContinuityFollowTarget(id: string): Promise<{
    targetId: string;
    kind: 'institution' | 'program';
    name: string;
    identityIds: string[];
  }> {
    const resolved = await this.resolveNode(id);
    if (
      resolved.node.status !== 'active' ||
      (resolved.node.kind !== 'institution' && resolved.node.kind !== 'program')
    ) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_FOLLOW_KIND_INVALID',
        message: 'Only Institution or Program can be followed',
      });
    }

    return {
      targetId: resolved.node.id,
      kind: resolved.node.kind,
      name: resolved.node.name,
      identityIds: await this.catalogIdentitySet(resolved.node.id),
    };
  }

  async projectAffiliationRecord(row: AcademicAffiliationRecord) {
    return this.publicAffiliation(row);
  }

  async resolveOrganizationScope(input: {
    institutionId: string;
    campusId?: string;
    academicUnitId?: string;
    programId?: string;
  }): Promise<{
    institutionId: string;
    campusId: string | null;
    academicUnitId: string | null;
    programId: string | null;
  }> {
    const institution = await this.requireKind(
      input.institutionId,
      'institution',
    );
    const campus = input.campusId
      ? await this.requireKind(input.campusId, 'campus')
      : undefined;
    const academicUnit = input.academicUnitId
      ? await this.requireKind(input.academicUnitId, 'academic_unit')
      : undefined;
    const program = input.programId
      ? await this.requireKind(input.programId, 'program')
      : undefined;

    for (const candidate of [campus?.id, academicUnit?.id, program?.id].filter(
      (value): value is string => Boolean(value),
    )) {
      if (!(await this.isDescendantOf(candidate, institution.id))) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_CONTEXT_MISMATCH',
          message: 'Organization scope nodes do not share one institution',
        });
      }
    }

    return {
      institutionId: institution.id,
      campusId: campus?.id ?? null,
      academicUnitId: academicUnit?.id ?? null,
      programId: program?.id ?? null,
    };
  }

  async resolveResourceContext(
    subjectId: string,
    courseOfferingId?: string,
  ): Promise<{ subjectId: string; courseOfferingId: string | null }> {
    const subject = await this.requireKind(subjectId, 'subject');
    let offeringId: string | null = null;

    if (courseOfferingId) {
      const offering = await this.requireKind(
        courseOfferingId,
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

    return {
      subjectId: subject.id,
      courseOfferingId: offeringId,
    };
  }

  async createProposal(userId: string, dto: CreateAcademicProposalDto) {
    const parentIds = await this.canonicalParentIds(
      dto.kind,
      uniqueStrings(dto.parentIds ?? []),
    );

    const created = await this.store.runAtomically(async () => {
      const proposal = await this.store.createProposal({
        id: randomUUID(),
        userId,
        kind: dto.kind,
        proposedName: cleanDisplayName(dto.proposedName),
        parentIds,
        evidenceUrl: dto.evidenceUrl,
        notes: dto.notes?.trim(),
        status: 'pending',
      });

      await this.audit('academic.proposal.created', userId, proposal.id, {
        kind: proposal.kind,
      });

      return proposal;
    });

    return { proposal: this.publicProposal(created) };
  }

  async listProposals(
    status: AcademicProposalStatus | undefined,
    limit: number,
  ) {
    return {
      proposals: (await this.store.listProposals(status, limit)).map((row) =>
        this.publicProposal(row),
      ),
    };
  }

  async reviewProposal(
    actorUserId: string,
    id: string,
    dto: ReviewAcademicProposalDto,
  ) {
    const proposal = await this.store.findProposalById(id);
    if (!proposal) this.notFound();

    if (proposal.status !== 'pending') {
      throw new ConflictException({
        code: 'ACADEMIC_PROPOSAL_ALREADY_REVIEWED',
        message: 'Academic proposal has already been reviewed',
      });
    }

    const requiresTarget = dto.status !== 'rejected';

    if (requiresTarget && !dto.canonicalTargetId) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_PROPOSAL_TARGET_REQUIRED',
        message: 'A canonical target is required for this review outcome',
      });
    }

    if (!requiresTarget && dto.canonicalTargetId) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_PROPOSAL_TARGET_NOT_ALLOWED',
        message: 'Rejected proposals cannot reference a canonical target',
      });
    }

    let canonicalTargetId: string | undefined;

    if (dto.canonicalTargetId) {
      const { node } = await this.resolveNode(dto.canonicalTargetId);

      if (node.status !== 'active' || node.kind !== proposal.kind) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_PROPOSAL_TARGET_INVALID',
          message:
            'Proposal canonical target must be an active node of the same kind',
        });
      }

      canonicalTargetId = node.id;
    }

    const reviewed = await this.store.runAtomically(async () => {
      const proposalAfterReview = await this.store.reviewProposal(
        id,
        actorUserId,
        dto.status,
        dto.reason.trim(),
        canonicalTargetId,
      );

      if (!proposalAfterReview) {
        throw new ConflictException({
          code: 'ACADEMIC_PROPOSAL_ALREADY_REVIEWED',
          message: 'Academic proposal changed concurrently',
        });
      }

      await this.audit(
        'academic.proposal.reviewed',
        actorUserId,
        proposalAfterReview.id,
        {
          status: proposalAfterReview.status,
          canonicalTargetId: proposalAfterReview.canonicalTargetId ?? null,
        },
      );

      return proposalAfterReview;
    });

    return { proposal: this.publicProposal(reviewed) };
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

  private async canonicalParentIds(
    kind: AcademicNodeKind,
    parentIds: string[],
  ): Promise<string[]> {
    if (kind === 'country' && parentIds.length > 0) this.invalidParent();
    if (kind !== 'country' && parentIds.length === 0) this.invalidParent();

    if (parentIds.length > 1 && kind !== 'subject') {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_PARENT_CARDINALITY_INVALID',
        message: 'Only Subject may currently have multiple catalog parents',
      });
    }

    const canonicalIds = uniqueStrings(
      await Promise.all(
        parentIds.map(async (parentId) => {
          const { node } = await this.resolveNode(parentId);
          return node.id;
        }),
      ),
    );

    await this.assertParentKinds(kind, canonicalIds);
    return canonicalIds;
  }

  private async catalogIdentitySet(id: string): Promise<string[]> {
    const { node } = await this.resolveNode(id);
    const identities = new Set<string>([node.id]);
    let frontier = [node.id];

    for (let depth = 0; depth < MAX_REDIRECT_DEPTH; depth += 1) {
      const remaining = ACADEMIC_REDIRECT_IDENTITY_LIMIT - identities.size;
      const page = await this.store.findDirectRedirectSources(
        frontier,
        Math.max(1, remaining),
      );

      if (remaining === 0) {
        if (page.items.length > 0 || page.hasMore) {
          this.redirectFanoutOverflow();
        }
        break;
      }

      if (page.hasMore) {
        this.redirectFanoutOverflow();
      }

      const next = uniqueStrings(
        page.items
          .map((source) => source.id)
          .filter((sourceId) => !identities.has(sourceId)),
      );

      if (next.length > remaining) {
        this.redirectFanoutOverflow();
      }
      if (next.length === 0) break;

      next.forEach((sourceId) => identities.add(sourceId));
      frontier = next;

      if (depth === MAX_REDIRECT_DEPTH - 1) {
        const deeper = await this.store.findDirectRedirectSources(frontier, 1);
        if (deeper.items.length > 0 || deeper.hasMore) {
          throw new ConflictException({
            code: 'ACADEMIC_REDIRECT_TOO_DEEP',
            message: 'Academic catalog redirect graph is too deep',
          });
        }
      }
    }

    return [...identities];
  }

  private redirectFanoutOverflow(): never {
    throw new ConflictException({
      code: 'ACADEMIC_REDIRECT_FANOUT_OVERFLOW',
      message:
        'Academic catalog redirect graph exceeds the safe identity budget',
      limit: ACADEMIC_REDIRECT_IDENTITY_LIMIT,
    });
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
    let canonicalAncestor: string;

    try {
      canonicalAncestor = (await this.resolveNode(ancestorId)).node.id;
    } catch (error) {
      if (error instanceof NotFoundException) return false;
      throw error;
    }

    let frontier = [candidateId];
    const visited = new Set<string>();

    for (let depth = 0; depth < MAX_ANCESTRY_DEPTH; depth += 1) {
      const ids = uniqueStrings(frontier).filter((id) => !visited.has(id));
      if (ids.length === 0) return false;
      ids.forEach((id) => visited.add(id));

      let resolvedNodes: AcademicCatalogNodeRecord[];

      try {
        resolvedNodes = await Promise.all(
          ids.map(async (id) => (await this.resolveNode(id)).node),
        );
      } catch (error) {
        if (error instanceof NotFoundException) return false;
        throw error;
      }
      const nodes = [
        ...new Map(resolvedNodes.map((node) => [node.id, node])).values(),
      ];

      if (nodes.some((node) => node.id === canonicalAncestor)) return true;

      frontier = uniqueStrings(nodes.flatMap((node) => node.parentIds));
    }

    return false;
  }

  private async publicAffiliation(row: AcademicAffiliationRecord) {
    const canonicalId = async (id?: string): Promise<string | undefined> =>
      id ? (await this.resolveNode(id)).node.id : undefined;

    return {
      id: row.id,
      institutionId: (await canonicalId(row.institutionId))!,
      campusId: await canonicalId(row.campusId),
      academicUnitId: await canonicalId(row.academicUnitId),
      programId: await canonicalId(row.programId),
      curriculumId: await canonicalId(row.curriculumId),
      status: row.status,
      roles: effectiveAcademicRelationshipRoles(row.status, row.roles),
      startedOn: row.startedOn,
      endedOn: row.endedOn,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async publicParticipation(row: {
    id: string;
    subjectId: string;
    courseOfferingId?: string;
    state: string;
    periodLabel?: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const subject = (await this.resolveNode(row.subjectId)).node;
    const courseOffering = row.courseOfferingId
      ? (await this.resolveNode(row.courseOfferingId)).node
      : undefined;

    return {
      id: row.id,
      subjectId: subject.id,
      subjectName: subject.name,
      courseOfferingId: courseOffering?.id,
      courseOfferingName: courseOffering?.name,
      state: row.state,
      periodLabel: row.periodLabel,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private publicContext(row: {
    affiliationId: string;
    subjectParticipationId?: string;
    revision: number;
    updatedAt: Date;
  }) {
    return {
      affiliationId: row.affiliationId,
      subjectParticipationId: row.subjectParticipationId,
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private publicProposal(row: AcademicCatalogProposalRecord) {
    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind,
      proposedName: row.proposedName,
      parentIds: row.parentIds,
      evidenceUrl: row.evidenceUrl,
      notes: row.notes,
      status: row.status,
      reviewedByUserId: row.reviewedByUserId,
      reviewReason: row.reviewReason,
      canonicalTargetId: row.canonicalTargetId,
      reviewedAt: row.reviewedAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async withSourceIdentityConflict<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AcademicSourceIdentityConflictError) {
        throw new ConflictException({
          code: 'ACADEMIC_SOURCE_IDENTITY_EXISTS',
          message: 'Academic source identity already exists',
        });
      }

      throw error;
    }
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

  private contextRevisionConflict(): never {
    throw new ConflictException({
      code: 'ACADEMIC_CONTEXT_REVISION_CONFLICT',
      message: 'Academic current context changed concurrently',
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
