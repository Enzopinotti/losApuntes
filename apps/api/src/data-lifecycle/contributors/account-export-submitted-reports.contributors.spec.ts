import {
  QaSubmittedReportsExportContributor,
  ResourceSubmittedReportsExportContributor,
} from './account-export-submitted-reports.contributors';

describe('submitted reports account export contributors', () => {
  it('maps the owner Q&A report page to portable fields only', async () => {
    const listAccountExportSubmittedReports = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'qa-report-1',
          targetType: 'answer',
          targetId: 'opaque-answer-ref',
          reason: 'plagiarism',
          details: null,
          createdAt: '2026-10-11T00:00:00.000Z',
          status: 'resolved',
          reviewedByUserId: 'reviewer-user',
        },
      ],
      nextCursor: 'qa-cursor',
    });
    const contributor = new QaSubmittedReportsExportContributor({
      listAccountExportSubmittedReports,
    } as never);

    await expect(
      contributor.readPage({ userId: 'owner-user', cursor: null, limit: 100 }),
    ).resolves.toEqual({
      records: [
        {
          id: 'qa-report-1',
          targetType: 'answer',
          targetId: 'opaque-answer-ref',
          reason: 'plagiarism',
          details: null,
          createdAt: '2026-10-11T00:00:00.000Z',
        },
      ],
      nextCursor: 'qa-cursor',
    });
    expect(listAccountExportSubmittedReports).toHaveBeenCalledWith(
      'owner-user',
      { limit: 100, cursor: null },
    );
  });

  it('maps the owner Resource report page without resolving the Resource or FileAsset', async () => {
    const listAccountExportSubmittedReports = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'resource-report-1',
          resourceId: 'opaque-resource-ref',
          reason: 'copyright',
          details: 'Owner report text',
          createdAt: '2026-10-11T00:00:00.000Z',
          status: 'dismissed',
          reviewedByUserId: 'reviewer-user',
          assetId: 'private-asset-id',
          objectKey: 'private/key',
        },
      ],
      nextCursor: null,
    });
    const contributor = new ResourceSubmittedReportsExportContributor({
      listAccountExportSubmittedReports,
    } as never);

    await expect(
      contributor.readPage({ userId: 'owner-user', cursor: null, limit: 100 }),
    ).resolves.toEqual({
      records: [
        {
          id: 'resource-report-1',
          resourceId: 'opaque-resource-ref',
          reason: 'copyright',
          details: 'Owner report text',
          createdAt: '2026-10-11T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    expect(listAccountExportSubmittedReports).toHaveBeenCalledWith(
      'owner-user',
      { limit: 100, cursor: null },
    );
  });
});
