import type { OrganizationService } from '../../organizations/domain/organization.service';
import { OrganizationSubmittedReportsExportContributor } from './account-export-organization-reports.contributors';

describe('Organization submitted reports account export contributor', () => {
  it("exports only the owner's submitted report fields and opaque target reference", async () => {
    const listAccountExportSubmittedReports = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'report-stable-id',
          targetType: 'organization_post',
          targetId: 'target-stable-id',
          reason: 'other',
          details: 'Owner-authored explanation',
          createdAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'reports-next',
    });
    const organizations = {
      listAccountExportSubmittedReports,
    } as unknown as jest.Mocked<OrganizationService>;

    const page = await new OrganizationSubmittedReportsExportContributor(
      organizations,
    ).readPage({
      userId: 'owner-user',
      cursor: null,
      limit: 100,
    });

    expect(page).toEqual({
      records: [
        {
          id: 'report-stable-id',
          targetType: 'organization_post',
          targetId: 'target-stable-id',
          reason: 'other',
          details: 'Owner-authored explanation',
          createdAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'reports-next',
    });
    for (const key of [
      'reporterUserId',
      'status',
      'updatedAt',
      'reviewedByUserId',
      'reviewedAt',
      'reviewReason',
      'reviewAction',
      'targetContent',
    ]) {
      expect(page.records[0]).not.toHaveProperty(key);
    }
    expect(listAccountExportSubmittedReports).toHaveBeenCalledWith(
      'owner-user',
      { limit: 100, cursor: null },
    );
  });
});
