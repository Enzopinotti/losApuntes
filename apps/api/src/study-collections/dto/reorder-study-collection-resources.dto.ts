import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsUUID, Min } from 'class-validator';

import { STUDY_COLLECTION_MAX_ITEMS } from '../domain/study-collection.store';

/** Entire current permutation: no hidden adds, removals or partial merges. */
export class ReorderStudyCollectionResourcesDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsArray()
  @ArrayMaxSize(STUDY_COLLECTION_MAX_ITEMS)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  resourceIds!: string[];
}
