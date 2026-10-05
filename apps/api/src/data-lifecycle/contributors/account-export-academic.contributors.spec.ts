import type { AcademicService } from '../../academic/domain/academic.service';
import {
  AcademicAffiliationsExportContributor,
  AcademicCurrentContextExportContributor,
  AcademicFollowsExportContributor,
  AcademicSubjectParticipationsExportContributor,
} from './account-export-academic.contributors';

describe('Academic account export contributors', () => {
  it('delegates paginated Academic sections', async () => {
    const listAccountExportAffiliations = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'aff-1',
          institutionId: 'inst-1',
          campusId: null,
          academicUnitId: null,
          programId: null,
          curriculumId: null,
          status: 'active',
          roles: [],
          startedOn: null,
          endedOn: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      nextCursor: 'aff-next',
    });
    const listAccountExportSubjectParticipations = jest
      .fn()
      .mockResolvedValue({
        items: [
          {
            id: 'part-1',
            subjectId: 'subject-1',
            courseOfferingId: null,
            state: 'completed',
            periodLabel: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        nextCursor: null,
      });
    const listAccountExportFollows = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'follow-1',
          targetNodeId: 'inst-1',
          targetKind: 'institution',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      nextCursor: 'follow-next',
    });
    const academic = {
      listAccountExportAffiliations,
      listAccountExportSubjectParticipations,
      listAccountExportFollows,
    } as unknown as jest.Mocked<AcademicService>;

    await expect(
      new AcademicAffiliationsExportContributor(academic).readPage({
        userId: 'user-1',
        cursor: 'aff-cursor',
        limit: 100,
      }),
    ).resolves.toMatchObject({
      nextCursor: 'aff-next',
      records: [{ id: 'aff-1' }],
    });

    await expect(
      new AcademicSubjectParticipationsExportContributor(academic).readPage({
        userId: 'user-1',
        cursor: null,
        limit: 50,
      }),
    ).resolves.toMatchObject({
      nextCursor: null,
      records: [{ id: 'part-1', subjectId: 'subject-1' }],
    });

    await expect(
      new AcademicFollowsExportContributor(academic).readPage({
        userId: 'user-1',
        cursor: 'follow-cursor',
        limit: 25,
      }),
    ).resolves.toMatchObject({
      nextCursor: 'follow-next',
      records: [{ id: 'follow-1', targetNodeId: 'inst-1' }],
    });

    expect(listAccountExportAffiliations).toHaveBeenCalledWith('user-1', {
      limit: 100,
      cursor: 'aff-cursor',
    });
    expect(listAccountExportSubjectParticipations).toHaveBeenCalledWith(
      'user-1',
      { limit: 50, cursor: null },
    );
    expect(listAccountExportFollows).toHaveBeenCalledWith('user-1', {
      limit: 25,
      cursor: 'follow-cursor',
    });
  });

  it('keeps current context cursorless and optional', async () => {
    const getAccountExportCurrentContext = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        affiliationId: 'aff-1',
        subjectParticipationId: null,
        revision: 3,
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
    const academic = {
      getAccountExportCurrentContext,
    } as unknown as jest.Mocked<AcademicService>;
    const contributor = new AcademicCurrentContextExportContributor(academic);

    await expect(
      contributor.readPage({ userId: 'user-1', cursor: null, limit: 100 }),
    ).resolves.toEqual({ records: [], nextCursor: null });
    await expect(
      contributor.readPage({ userId: 'user-1', cursor: null, limit: 100 }),
    ).resolves.toEqual({
      records: [
        {
          affiliationId: 'aff-1',
          subjectParticipationId: null,
          revision: 3,
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    await expect(
      contributor.readPage({
        userId: 'user-1',
        cursor: 'unexpected',
        limit: 100,
      }),
    ).rejects.toThrow('does not accept a cursor');
    expect(getAccountExportCurrentContext).toHaveBeenCalledTimes(2);
  });
});
