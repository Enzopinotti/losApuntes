import { ConfigService } from '@nestjs/config';

import { ReleaseIdentityService } from './release-identity.service';

describe('ReleaseIdentityService', () => {
  const sourceSha = 'b3ee3473c4f623a4405227d246260865474d0050';

  function createService(values: Record<string, string | undefined>) {
    const config = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    return new ReleaseIdentityService(config);
  }

  it('returns a bounded observable release identity', () => {
    const service = createService({
      API_RELEASE_ID: 'api-2026.10.03-1',
      API_RELEASE_SOURCE_SHA: sourceSha.toUpperCase(),
    });

    expect(service.current()).toEqual({
      status: 'available',
      service: 'api',
      releaseId: 'api-2026.10.03-1',
      sourceSha,
    });
  });

  it.each([
    {},
    { API_RELEASE_ID: 'api-1' },
    { API_RELEASE_SOURCE_SHA: sourceSha },
    {
      API_RELEASE_ID: 'contains whitespace',
      API_RELEASE_SOURCE_SHA: sourceSha,
    },
    { API_RELEASE_ID: 'api-1', API_RELEASE_SOURCE_SHA: 'main' },
  ])('fails closed for missing or malformed identity %#', (values) => {
    const service = createService(values);

    expect(service.current()).toEqual({
      status: 'unavailable',
      service: 'api',
    });
  });
});
