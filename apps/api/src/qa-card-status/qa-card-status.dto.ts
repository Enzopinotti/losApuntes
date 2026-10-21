import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

export const QA_CARD_STATUS_MAX_IDS = 20;

export class BatchQaCardStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(QA_CARD_STATUS_MAX_IDS)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  questionIds!: string[];
}
