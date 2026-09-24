import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  GraduateAcademicAffiliationDto,
  UpdateAcademicAffiliationRolesDto,
} from '../dto/academic.dto';
import {
  effectiveAcademicRelationshipRoles,
  graduationRoles,
  relationshipRolesCompatible,
} from './academic-lifecycle.helpers';
import { ACADEMIC_STORE, type AcademicStore } from './academic.store';
import { AcademicService } from './academic.service';
import type {
  AcademicAffiliationRecord,
  AcademicFollowRecord,
} from './academic.types';

type LifecyclePhase = 'student' | 'alumni' | 'mixed' | 'community';

@Injectable()
export class AcademicLifecycleService {
  constructor(
    @Inject(ACADEMIC_STORE)
    private readonly store: AcademicStore,
    private readonly academic: AcademicService,
  ) {}

  async getLifecycle(userId: string) {
    const [affiliations, participations, context, follows] = await Promise.all([
      this.store.listAffiliationsForUser(userId),
      this.store.listSubjectParticipationsForUser(userId),
      this.store.getCurrentContext(userId),
      this.store.listAcademicFollows(userId),
    ]);

    const activeStudentAffiliationIds = affiliations
      .filter((row) => {
        if (row.status !== 'active' && row.status !== 'paused') return false;
        const roles = effectiveAcademicRelationshipRoles(row.status, row.roles);
        return roles.includes('student') || roles.includes('advanced_student');
      })
      .map((row) => row.id)
      .sort();

    const alumniAffiliationIds = affiliations
      .filter((row) => {
        if (row.status === 'alumni' || row.status === 'completed') return true;
        const roles = effectiveAcademicRelationshipRoles(row.status, row.roles);
        return roles.includes('alumni') || roles.includes('recent_graduate');
      })
      .map((row) => row.id)
      .sort();

    const currentSubjectIds = [
      ...new Set(
        participations
          .filter((row) => row.state === 'current')
          .map((row) => row.subjectId),
      ),
    ].sort();

    return {
      phase: this.phase(
        activeStudentAffiliationIds.length > 0,
        alumniAffiliationIds.length > 0,
      ),
      activeStudentAffiliationIds,
      alumniAffiliationIds,
      currentSubjectIds,
      hasCurrentSubjectContext: Boolean(context?.subjectParticipationId),
      currentAffiliationId: context?.affiliationId ?? null,
      follows: await this.followProjection(follows),
    };
  }

  async graduate(
    userId: string,
    id: string,
    dto: GraduateAcademicAffiliationDto,
  ) {
    const existing = await this.requireOwnedAffiliation(userId, id);

    if (existing.status === 'applicant' || existing.status === 'withdrawn') {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_GRADUATION_INELIGIBLE',
        message: 'Affiliation is not eligible for graduation',
      });
    }

    if (existing.status === 'alumni') {
      return {
        affiliation: await this.academic.projectAffiliationRecord(existing),
        transitionedSubjectCount: 0,
        lifecycle: await this.getLifecycle(userId),
      };
    }

    const nextRoles = graduationRoles(
      effectiveAcademicRelationshipRoles(existing.status, existing.roles),
    );
    let transitionedSubjectCount = 0;
    let updated: AcademicAffiliationRecord | null = null;

    await this.store.runAtomically(async () => {
      const currentParticipations =
        await this.store.listSubjectParticipationsForUser(userId);
      const scopedCurrentIds: string[] = [];

      for (const participation of currentParticipations) {
        if (
          participation.state === 'current' &&
          (await this.academic.participationBelongsToAffiliation(
            participation.subjectId,
            existing,
          ))
        ) {
          scopedCurrentIds.push(participation.id);
        }
      }

      updated = await this.store.transitionAffiliationToAlumni(
        userId,
        id,
        dto.graduatedOn,
        nextRoles,
      );

      if (!updated) {
        const raced = await this.store.findAffiliationById(id);
        if (raced?.userId === userId && raced.status === 'alumni') {
          updated = raced;
          return;
        }

        throw new ConflictException({
          code: 'ACADEMIC_GRADUATION_CONFLICT',
          message: 'Affiliation changed concurrently',
        });
      }

      transitionedSubjectCount =
        await this.store.transitionSubjectParticipationStates(
          userId,
          scopedCurrentIds,
          'current',
          'completed',
        );

      const context = await this.store.getCurrentContext(userId);
      if (context?.affiliationId === id && context.subjectParticipationId) {
        await this.store.setCurrentContext({
          userId,
          affiliationId: id,
        });
      }

      await this.store.appendAuditEvent({
        id: randomUUID(),
        event: 'academic.affiliation.graduated',
        actorUserId: userId,
        targetId: id,
        metadata: {
          graduatedOn: dto.graduatedOn,
          transitionedSubjectCount,
        },
        createdAt: new Date(),
      });
    });

    if (!updated) {
      throw new ConflictException({
        code: 'ACADEMIC_GRADUATION_CONFLICT',
        message: 'Affiliation graduation did not complete',
      });
    }

    return {
      affiliation: await this.academic.projectAffiliationRecord(updated),
      transitionedSubjectCount,
      lifecycle: await this.getLifecycle(userId),
    };
  }

  async updateRoles(
    userId: string,
    id: string,
    dto: UpdateAcademicAffiliationRolesDto,
  ) {
    const existing = await this.requireOwnedAffiliation(userId, id);
    const roles = [...new Set(dto.roles)];

    if (!relationshipRolesCompatible(existing.status, roles)) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_AFFILIATION_ROLE_INVALID',
        message: 'Academic relationship roles conflict with affiliation status',
      });
    }

    const updated = await this.store.runAtomically(async () => {
      const row = await this.store.updateAffiliationRoles(
        userId,
        id,
        existing.status,
        roles,
      );
      if (!row) {
        throw new ConflictException({
          code: 'ACADEMIC_AFFILIATION_CONFLICT',
          message: 'Academic affiliation changed concurrently',
        });
      }

      await this.store.appendAuditEvent({
        id: randomUUID(),
        event: 'academic.affiliation.roles_updated',
        actorUserId: userId,
        targetId: id,
        metadata: {
          roleCount: roles.length,
        },
        createdAt: new Date(),
      });

      return row;
    });

    return {
      affiliation: await this.academic.projectAffiliationRecord(updated),
      lifecycle: await this.getLifecycle(userId),
    };
  }

  async listFollows(userId: string) {
    return {
      follows: await this.followProjection(
        await this.store.listAcademicFollows(userId),
      ),
    };
  }

  async follow(userId: string, nodeId: string) {
    const target = await this.academic.resolveContinuityFollowTarget(nodeId);
    await this.store.upsertAcademicFollow({
      id: randomUUID(),
      userId,
      targetNodeId: target.targetId,
      targetKind: target.kind,
    });

    return {
      following: true,
      target: {
        id: target.targetId,
        kind: target.kind,
        name: target.name,
      },
    };
  }

  async unfollow(userId: string, nodeId: string): Promise<void> {
    const target = await this.academic.resolveContinuityFollowTarget(nodeId);
    await this.store.removeAcademicFollows(userId, target.identityIds);
  }

  private phase(hasStudent: boolean, hasAlumni: boolean): LifecyclePhase {
    if (hasStudent && hasAlumni) return 'mixed';
    if (hasStudent) return 'student';
    if (hasAlumni) return 'alumni';
    return 'community';
  }

  private async followProjection(rows: AcademicFollowRecord[]) {
    const projected = new Map<
      string,
      { targetId: string; kind: 'institution' | 'program'; name: string }
    >();

    for (const row of rows) {
      try {
        const target = await this.academic.resolveContinuityFollowTarget(
          row.targetNodeId,
        );
        projected.set(target.targetId, {
          targetId: target.targetId,
          kind: target.kind,
          name: target.name,
        });
      } catch (error) {
        if (error instanceof NotFoundException) continue;
        throw error;
      }
    }

    return [...projected.values()].sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.name.localeCompare(right.name, 'es'),
    );
  }

  private async requireOwnedAffiliation(
    userId: string,
    id: string,
  ): Promise<AcademicAffiliationRecord> {
    const affiliation = await this.store.findAffiliationById(id);
    if (!affiliation || affiliation.userId !== userId) this.notFound();
    return affiliation;
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'ACADEMIC_NOT_FOUND',
      message: 'Academic entity was not found',
    });
  }
}
