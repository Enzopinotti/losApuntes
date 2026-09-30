import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export const MAX_RESOURCE_FILE_BYTES = 50 * 1024 * 1024;

export class CreateFileUploadIntentDto {
  @IsUUID('4')
  operationKey!: string;

  @IsString()
  @Length(1, 180)
  filename!: string;

  @IsString()
  @Length(3, 100)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RESOURCE_FILE_BYTES)
  byteSize!: number;
}
