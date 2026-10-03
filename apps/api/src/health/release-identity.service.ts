import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RELEASE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const SOURCE_SHA_PATTERN = /^[a-f\d]{40}$/iu;

export type ReleaseIdentityResult =
  | Readonly<{
      status: 'available';
      service: 'api';
      releaseId: string;
      sourceSha: string;
    }>
  | Readonly<{
      status: 'unavailable';
      service: 'api';
    }>;

function normalizeReleaseId(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return RELEASE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeSourceSha(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return SOURCE_SHA_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
}

@Injectable()
export class ReleaseIdentityService {
  constructor(private readonly config: ConfigService) {}

  current(): ReleaseIdentityResult {
    const releaseId = normalizeReleaseId(
      this.config.get<string>('API_RELEASE_ID'),
    );
    const sourceSha = normalizeSourceSha(
      this.config.get<string>('API_RELEASE_SOURCE_SHA'),
    );

    if (!releaseId || !sourceSha) {
      return Object.freeze({
        status: 'unavailable' as const,
        service: 'api' as const,
      });
    }

    return Object.freeze({
      status: 'available' as const,
      service: 'api' as const,
      releaseId,
      sourceSha,
    });
  }
}
