// auth/dto/register.dto.ts
import { IsAlphanumeric, IsEmail, MinLength } from "class-validator";

export class RegisterDto {
  @IsAlphanumeric() @MinLength(3) username: string;
  @IsEmail() email: string;
  @MinLength(8) password: string;
}