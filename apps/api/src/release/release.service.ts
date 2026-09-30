import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ApiReleaseMetadata = {
  schemaVersion: 1;
  service: 'api';
  releaseId: string;
  sourceSha: string | null;
};

@Injectable()
export class ReleaseService {
  constructor(private readonly config: ConfigService) {}

  metadata(): ApiReleaseMetadata {
    return {
      schemaVersion: 1,
      service: 'api',
      releaseId: this.config.get<string>('RELEASE_ID') ?? 'local-runtime',
      sourceSha: this.config.get<string>('RELEASE_SHA') ?? null,
    };
  }
}
