import type { AcademicService } from '../../academic/domain/academic.service';
import type { PilotEventService } from '../../pilot/telemetry/pilot-event.service';
import type { ProfileService } from '../../profile/domain/profile.service';
import type { ResourceService } from '../../resources/domain/resource.service';
import { SearchDiscoveryService } from './search-discovery.service';

type ResourceApi = Pick<ResourceService, 'search'>;
type AcademicApi = Pick<
  AcademicService,
  | 'searchCatalog'
  | 'listSubjectParticipations'
  | 'getCatalogNode'
  | 'resolveResourceContext'
>;
type ProfileApi = Pick<ProfileService, 'searchPublicProfiles'>;

function resources(): jest.Mocked<ResourceApi> {
  return {
    search: jest.fn(),
  };
}

function academic(): jest.Mocked<AcademicApi> {
  return {
    searchCatalog: jest.fn(),
    listSubjectParticipations: jest.fn(),
    getCatalogNode: jest.fn(),
    resolveResourceContext: jest.fn(),
  };
}

function profiles(): jest.Mocked<ProfileApi> {
  return {
    searchPublicProfiles: jest.fn(),
  };
}

function service(
  resourceApi: jest.Mocked<ResourceApi>,
  academicApi: jest.Mocked<AcademicApi>,
  profileApi: jest.Mocked<ProfileApi>,
) {
  return new SearchDiscoveryService(
    resourceApi as unknown as ResourceService,
    academicApi as unknown as AcademicService,
    profileApi as unknown as ProfileService,
    {
      recordBestEffort: jest.fn().mockResolvedValue(undefined),
    } as unknown as PilotEventService,
  );
}

const resourceItem = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Base de Datos - resumen',
};

describe('SearchDiscoveryService', () => {
  it('groups all authorities without inventing a cross-type score', async () => {
    const resourceApi = resources();
    const academicApi = academic();
    const profileApi = profiles();

    resourceApi.search.mockResolvedValue({
      items: [resourceItem] as never[],
      nextCursor: null,
    });
    academicApi.searchCatalog.mockResolvedValue({
      items: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          kind: 'subject',
          name: 'Base de Datos',
          aliases: ['Bases de Datos'],
        },
      ] as never[],
      nextCursor: null,
    });
    profileApi.searchPublicProfiles.mockResolvedValue({
      items: [
        {
          profileId: '33333333-3333-4333-8333-333333333333',
          displayName: 'Ana Pública',
          avatarUrl: null,
        },
      ],
    });

    const result = await service(resourceApi, academicApi, profileApi).search(
      'viewer-1',
      {
        q: '  Base   de Datos ',
        scope: 'all',
        limit: 8,
      },
    );

    expect(result.query).toBe('Base de Datos');
    expect(result.scope).toBe('all');
    expect(result.results.resources).toHaveLength(1);
    expect(result.results.subjects).toEqual([
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Base de Datos',
        aliases: ['Bases de Datos'],
        kind: 'subject',
      },
    ]);
    expect(result.results.people[0]?.displayName).toBe('Ana Pública');

    expect(resourceApi.search).toHaveBeenCalledWith('viewer-1', {
      q: 'Base de Datos',
      limit: 8,
    });
    expect(academicApi.searchCatalog).toHaveBeenCalledWith({
      kind: 'subject',
      q: 'Base de Datos',
      limit: 8,
    });
    expect(profileApi.searchPublicProfiles).toHaveBeenCalledWith(
      'Base de Datos',
      8,
    );

    expect(result).not.toHaveProperty('score');
    expect(JSON.stringify(result)).not.toContain('careerDiscoveryOptIn');
  });

  it('executes only the requested search scope and preserves resource filters', async () => {
    const resourceApi = resources();
    const academicApi = academic();
    const profileApi = profiles();
    resourceApi.search.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    const subjectId = '22222222-2222-4222-8222-222222222222';
    academicApi.resolveResourceContext.mockResolvedValue({
      subjectId,
      courseOfferingId: null,
    });
    const result = await service(resourceApi, academicApi, profileApi).search(
      undefined,
      {
        q: 'apunte',
        scope: 'resources',
        limit: 5,
        subjectId,
      },
    );

    expect(result.results).toEqual({
      resources: [],
      subjects: [],
      people: [],
    });
    expect(resourceApi.search).toHaveBeenCalledWith(undefined, {
      q: 'apunte',
      subjectId,
      limit: 5,
    });
    expect(academicApi.searchCatalog).not.toHaveBeenCalled();
    expect(profileApi.searchPublicProfiles).not.toHaveBeenCalled();
  });

  it('canonicalizes resource subject filters before delegating search', async () => {
    const resourceApi = resources();
    const academicApi = academic();
    const profileApi = profiles();
    const mergedSubjectId = '22222222-2222-4222-8222-222222222222';
    const canonicalSubjectId = '33333333-3333-4333-8333-333333333333';

    academicApi.resolveResourceContext.mockResolvedValue({
      subjectId: canonicalSubjectId,
      courseOfferingId: null,
    });
    resourceApi.search.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    await service(resourceApi, academicApi, profileApi).search(undefined, {
      q: 'resumen',
      scope: 'resources',
      limit: 4,
      subjectId: mergedSubjectId,
    });

    expect(academicApi.resolveResourceContext).toHaveBeenCalledWith(
      mergedSubjectId,
    );
    expect(resourceApi.search).toHaveBeenCalledWith(undefined, {
      q: 'resumen',
      subjectId: canonicalSubjectId,
      limit: 4,
    });
  });

  it('supports subject-only and people-only searches independently', async () => {
    const resourceApi = resources();
    const academicApi = academic();
    const profileApi = profiles();

    academicApi.searchCatalog.mockResolvedValue({
      items: [] as never[],
      nextCursor: null,
    });
    profileApi.searchPublicProfiles.mockResolvedValue({ items: [] });

    const instance = service(resourceApi, academicApi, profileApi);

    await instance.search(undefined, {
      q: 'álgebra',
      scope: 'subjects',
      limit: 3,
    });
    expect(academicApi.searchCatalog).toHaveBeenCalledTimes(1);
    expect(resourceApi.search).not.toHaveBeenCalled();
    expect(profileApi.searchPublicProfiles).not.toHaveBeenCalled();

    jest.clearAllMocks();

    await instance.search(undefined, {
      q: 'ana',
      scope: 'people',
      limit: 3,
    });
    expect(profileApi.searchPublicProfiles).toHaveBeenCalledTimes(1);
    expect(resourceApi.search).not.toHaveBeenCalled();
    expect(academicApi.searchCatalog).not.toHaveBeenCalled();
  });

  it('builds deterministic contextual buckets from current subjects only', async () => {
    const resourceApi = resources();
    const academicApi = academic();
    const profileApi = profiles();

    academicApi.listSubjectParticipations.mockResolvedValue({
      participations: [
        {
          id: 'p1',
          subjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          state: 'current',
        },
        {
          id: 'p2',
          subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          state: 'completed',
        },
        {
          id: 'p3',
          subjectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          state: 'current',
        },
        {
          id: 'p4',
          subjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          state: 'current',
        },
      ] as never[],
    });

    academicApi.getCatalogNode.mockImplementation((id) =>
      Promise.resolve({
        node: {
          id,
          kind: 'subject',
          name:
            id === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
              ? 'Sistemas'
              : 'Arquitectura',
        },
        resolvedFromId: undefined,
      } as never),
    );

    resourceApi.search.mockImplementation((_viewer, input) =>
      Promise.resolve({
        items: [
          {
            id:
              input.subjectId === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
                ? 'r-sistemas'
                : 'r-arquitectura',
          },
        ] as never[],
        nextCursor: null,
      }),
    );

    const result = await service(
      resourceApi,
      academicApi,
      profileApi,
    ).contextual('user-1', {
      subjectLimit: 6,
      resourcesPerSubject: 4,
    });

    expect(result.subjects.map((bucket) => bucket.subject.name)).toEqual([
      'Arquitectura',
      'Sistemas',
    ]);
    expect(academicApi.getCatalogNode).toHaveBeenCalledTimes(2);
    expect(resourceApi.search).toHaveBeenCalledTimes(2);
    expect(resourceApi.search).toHaveBeenCalledWith('user-1', {
      subjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      limit: 4,
    });
  });

  it('returns an empty contextual surface when there are no current subjects', async () => {
    const resourceApi = resources();
    const academicApi = academic();
    const profileApi = profiles();

    academicApi.listSubjectParticipations.mockResolvedValue({
      participations: [
        {
          id: 'p1',
          subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          state: 'completed',
        },
      ] as never[],
    });

    const result = await service(
      resourceApi,
      academicApi,
      profileApi,
    ).contextual('user-1', {
      subjectLimit: 4,
      resourcesPerSubject: 3,
    });

    expect(result).toEqual({ subjects: [] });
    expect(academicApi.getCatalogNode).not.toHaveBeenCalled();
    expect(resourceApi.search).not.toHaveBeenCalled();
  });

  it('bounds contextual fan-out before resolving subjects', async () => {
    const resourceApi = resources();
    const academicApi = academic();
    const profileApi = profiles();

    academicApi.listSubjectParticipations.mockResolvedValue({
      participations: Array.from({ length: 20 }, (_, index) => ({
        id: `p-${index}`,
        subjectId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        state: 'current',
      })) as never[],
    });
    academicApi.getCatalogNode.mockImplementation((id) =>
      Promise.resolve({
        node: { id, kind: 'subject', name: id },
        resolvedFromId: undefined,
      } as never),
    );
    resourceApi.search.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    const result = await service(
      resourceApi,
      academicApi,
      profileApi,
    ).contextual('user-1', {
      subjectLimit: 3,
      resourcesPerSubject: 2,
    });

    expect(academicApi.getCatalogNode).toHaveBeenCalledTimes(6);
    expect(
      academicApi.getCatalogNode.mock.calls.map(([subjectId]) => subjectId),
    ).toEqual([
      '00000000-0000-4000-8000-000000000000',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000005',
    ]);
    expect(result.subjects).toHaveLength(3);
  });
});
