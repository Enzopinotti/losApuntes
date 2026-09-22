import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class EmailAddressDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
