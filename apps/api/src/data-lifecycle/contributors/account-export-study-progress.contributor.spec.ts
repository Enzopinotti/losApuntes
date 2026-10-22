import { StudyProgressExportReader } from '../../study-progress/mongo/study-progress-export.reader';
import { StudyProgressExportContributor } from './account-export-study-progress.contributor';

const subjectId = '11111111-1111-4111-8111-111111111111';

describe('StudyProgressExportContributor v3', () => {
  it('emits only owner-authored progress fields', async () => {
    const reader = {
      listAccountExportProgress: jest.fn().mockResolvedValue({
        items: [
          {
            subjectId,
            revision: 2,
            plan: {
              format: 'losapuntes.study-session',
              version: 1,
              subjectId,
              title: 'Parcial',
              notes: '',
              startsAt: null,
              tasks: [],
            },
            createdAt: '2026-10-01T12:00:00.000Z',
            updatedAt: '2026-10-02T12:00:00.000Z',
            ownerUserId: 'excluded',
            internalId: 'excluded',
          },
        ],
        nextCursor: 'next',
      }),
    };
    const contributor = new StudyProgressExportContributor(
      reader as unknown as StudyProgressExportReader,
    );
    const page = await contributor.readPage({
      userId: 'owner-sentinel',
      cursor: null,
      limit: 100,
    });
    expect(reader.listAccountExportProgress).toHaveBeenCalledWith(
      'owner-sentinel',
      { cursor: null, limit: 100 },
    );
    expect(contributor.sectionId).toBe('study.progress');
    expect(page.nextCursor).toBe('next');
    expect(page.records).toHaveLength(1);
    expect(Object.keys(page.records[0]).sort()).toEqual([
      'createdAt',
      'plan',
      'revision',
      'subjectId',
      'updatedAt',
    ]);
    expect(JSON.stringify(page.records)).not.toContain('excluded');
  });

  it('projects portable tasks explicitly without leaking extra nested fields', async () => {
    const reader = {
      listAccountExportProgress: jest.fn().mockResolvedValue({
        items: [
          {
            subjectId,
            revision: 3,
            plan: {
              format: 'losapuntes.study-session',
              version: 1,
              subjectId,
              title: 'Preparar final',
              notes: 'Repaso',
              startsAt: null,
              tasks: [
                {
                  kind: 'resource',
                  id: '22222222-2222-4222-8222-222222222222',
                  minutes: 25,
                  done: false,
                  internalCache: 'not-portable',
                },
              ],
              serverInternal: 'not-portable',
            },
            createdAt: '2026-10-01T12:00:00.000Z',
            updatedAt: '2026-10-02T12:00:00.000Z',
          },
        ],
        nextCursor: null,
      }),
    };
    const adapter = new StudyProgressExportContributor(
      reader as unknown as StudyProgressExportReader,
    );
    const page = await adapter.readPage({
      userId: 'owner-sentinel',
      cursor: null,
      limit: 100,
    });
    expect(page.records).toEqual([
      {
        subjectId,
        revision: 3,
        plan: {
          format: 'losapuntes.study-session',
          version: 1,
          subjectId,
          title: 'Preparar final',
          notes: 'Repaso',
          startsAt: null,
          tasks: [
            {
              kind: 'resource',
              id: '22222222-2222-4222-8222-222222222222',
              minutes: 25,
              done: false,
            },
          ],
        },
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-02T12:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(page)).not.toContain('not-portable');
  });

  it('propagates reader errors rather than emitting a partial section', async () => {
    const reader = {
      listAccountExportProgress: jest
        .fn()
        .mockRejectedValue(new Error('storage unavailable')),
    };
    const contributor = new StudyProgressExportContributor(
      reader as unknown as StudyProgressExportReader,
    );
    await expect(
      contributor.readPage({
        userId: 'owner-sentinel',
        cursor: null,
        limit: 100,
      }),
    ).rejects.toThrow('storage unavailable');
  });
});
