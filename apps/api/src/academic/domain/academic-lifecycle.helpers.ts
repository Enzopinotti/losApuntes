import type {
  AcademicAffiliationStatus,
  AcademicRelationshipRole,
} from './academic.types';

const STUDENT_ROLES = new Set<AcademicRelationshipRole>([
  'student',
  'advanced_student',
]);

const ALUMNI_ROLES = new Set<AcademicRelationshipRole>([
  'recent_graduate',
  'alumni',
]);

export function effectiveAcademicRelationshipRoles(
  status: AcademicAffiliationStatus,
  roles: readonly AcademicRelationshipRole[] | undefined,
): AcademicRelationshipRole[] {
  if (roles !== undefined) return [...new Set(roles)];

  if (status === 'active' || status === 'paused') return ['student'];
  if (status === 'completed') return ['recent_graduate'];
  if (status === 'alumni') return ['alumni'];
  return [];
}

export function relationshipRolesCompatible(
  status: AcademicAffiliationStatus,
  roles: readonly AcademicRelationshipRole[],
): boolean {
  if (status === 'active' || status === 'paused') {
    return roles.every((role) => !ALUMNI_ROLES.has(role));
  }

  if (status === 'completed' || status === 'alumni') {
    return roles.every((role) => !STUDENT_ROLES.has(role));
  }

  if (status === 'applicant' || status === 'withdrawn') {
    return roles.every(
      (role) => !STUDENT_ROLES.has(role) && !ALUMNI_ROLES.has(role),
    );
  }

  return true;
}

export function graduationRoles(
  roles: readonly AcademicRelationshipRole[],
): AcademicRelationshipRole[] {
  return [
    ...roles.filter(
      (role) =>
        role !== 'student' &&
        role !== 'advanced_student' &&
        role !== 'recent_graduate' &&
        role !== 'alumni',
    ),
    'recent_graduate',
    'alumni',
  ];
}
