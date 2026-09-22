import { ConfigService } from '@nestjs/config';

export function requireConfigString(
  config: ConfigService,
  key: string,
): string {
  const value = config.get<string>(key)?.trim();

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}
