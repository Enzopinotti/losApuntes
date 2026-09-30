import { ConfigService } from '@nestjs/config';

import { ReleaseService } from './release.service';

describe('ReleaseService', () => {
  it('returns exact configured release identity without topology or secrets', () => {
    const service = new ReleaseService(
      new ConfigService({
        RELEASE_ID: 'beta-2026-09-30.1',
        RELEASE_SHA: 'a'.repeat(40),
      }),
    );

    expect(service.metadata()).toEqual({
      schemaVersion: 1,
      service: 'api',
      releaseId: 'beta-2026-09-30.1',
      sourceSha: 'a'.repeat(40),
    });
  });

  it('uses an explicit local identity when no source SHA is embedded', () => {
    const service = new ReleaseService(new ConfigService({}));

    expect(service.metadata()).toEqual({
      schemaVersion: 1,
      service: 'api',
      releaseId: 'local-runtime',
      sourceSha: null,
    });
  });
});
