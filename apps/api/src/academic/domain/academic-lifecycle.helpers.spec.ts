import {
  effectiveAcademicRelationshipRoles,
  graduationRoles,
  relationshipRolesCompatible,
} from './academic-lifecycle.helpers';

describe('academic lifecycle helpers', () => {
  it('derives conservative roles for historical rows without explicit roles', () => {
    expect(effectiveAcademicRelationshipRoles('active', undefined)).toEqual([
      'student',
    ]);
    expect(effectiveAcademicRelationshipRoles('paused', [])).toEqual([
      'student',
    ]);
    expect(effectiveAcademicRelationshipRoles('completed', undefined)).toEqual([
      'recent_graduate',
    ]);
    expect(effectiveAcademicRelationshipRoles('alumni', undefined)).toEqual([
      'alumni',
    ]);
    expect(effectiveAcademicRelationshipRoles('withdrawn', undefined)).toEqual(
      [],
    );
  });

  it('deduplicates explicit relationship roles without inventing defaults', () => {
    expect(
      effectiveAcademicRelationshipRoles('active', [
        'advanced_student',
        'mentor',
        'mentor',
      ]),
    ).toEqual(['advanced_student', 'mentor']);
  });

  it('validates relationship roles against lifecycle status', () => {
    expect(
      relationshipRolesCompatible('active', [
        'advanced_student',
        'mentor',
        'research',
      ]),
    ).toBe(true);
    expect(relationshipRolesCompatible('active', ['alumni'])).toBe(false);
    expect(relationshipRolesCompatible('alumni', ['student'])).toBe(false);
    expect(relationshipRolesCompatible('alumni', ['alumni', 'mentor'])).toBe(
      true,
    );
    expect(relationshipRolesCompatible('withdrawn', ['recent_graduate'])).toBe(
      false,
    );
    expect(relationshipRolesCompatible('withdrawn', ['community'])).toBe(true);
  });

  it('converts student roles to alumni roles while preserving unrelated roles', () => {
    expect(
      graduationRoles([
        'student',
        'advanced_student',
        'recent_graduate',
        'alumni',
        'mentor',
        'research',
      ]),
    ).toEqual(['mentor', 'research', 'recent_graduate', 'alumni']);
  });
});
