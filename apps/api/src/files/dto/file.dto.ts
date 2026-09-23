import { Type } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export const MAX_RESOURCE_FILE_BYTES = 50 * 1024 * 1024;

export class CreateFileUploadIntentDto {
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
