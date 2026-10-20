import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

import { SAVED_STATUS_MAX_RESOURCES } from '../resource-saved-status.service';

export class SavedStatusBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SAVED_STATUS_MAX_RESOURCES)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  resourceIds!: string[];
}
