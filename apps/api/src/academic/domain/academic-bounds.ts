import { ConflictException } from '@nestjs/common';

export const ACADEMIC_AFFILIATION_VISIBLE_LIMIT = 50;
export const ACADEMIC_PARTICIPATION_VISIBLE_LIMIT = 100;
export const ACADEMIC_FOLLOW_VISIBLE_LIMIT = 100;

export const ACADEMIC_AFFILIATION_DECISION_LIMIT = 128;
export const ACADEMIC_PARTICIPATION_DECISION_LIMIT = 256;
export const ACADEMIC_CURRENT_PARTICIPATION_DECISION_LIMIT = 256;
export const ACADEMIC_FOLLOW_LIFECYCLE_LIMIT = 256;

export type BoundedAcademicPage<T> = {
  items: T[];
  hasMore: boolean;
};

export function requireCompleteAcademicPage<T>(
  page: BoundedAcademicPage<T>,
  collection:
    | 'affiliations'
    | 'subject_participations'
    | 'current_subject_participations',
): T[] {
  if (page.hasMore) {
    throw new ConflictException({
      code: 'ACADEMIC_INVENTORY_OVERFLOW',
      message:
        'Academic history exceeds the safe decision budget; narrow or repair the stored inventory before retrying',
      collection,
    });
  }

  return page.items;
}
