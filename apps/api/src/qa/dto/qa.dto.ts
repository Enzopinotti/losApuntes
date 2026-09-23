import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import {
  QA_REPORT_REASONS,
  QUESTION_STATES,
  type QaReportReason,
  type QuestionState,
} from '../domain/qa.types';

export class QuestionSearchDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  q?: string;

  @IsOptional()
  @IsUUID('4')
  subjectId?: string;

  @IsOptional()
  @IsIn(QUESTION_STATES)
  status?: QuestionState;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;

  @IsOptional()
  @IsString()
  @Length(4, 512)
  cursor?: string;
}

export class CreateQuestionDto {
  @IsUUID('4')
  subjectId!: string;

  @IsOptional()
  @IsUUID('4')
  courseOfferingId?: string;

  @IsString()
  @Length(5, 180)
  title!: string;

  @IsString()
  @Length(10, 5000)
  body!: string;
}

export class UpdateQuestionDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @Length(5, 180)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(10, 5000)
  body?: string;

  @IsOptional()
  @IsIn(QUESTION_STATES)
  status?: QuestionState;
}

export class CreateAnswerDto {
  @IsString()
  @Length(2, 5000)
  body!: string;
}

export class UpdateAnswerDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsString()
  @Length(2, 5000)
  body!: string;
}

export class AcceptAnswerDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class CreateQaReportDto {
  @IsIn(QA_REPORT_REASONS)
  reason!: QaReportReason;

  @IsOptional()
  @IsString()
  @Length(3, 1500)
  details?: string | null;
}
