import type { AcademicService } from '../../academic/domain/academic.service';
import { AcademicProposalsExportContributor } from './account-export-academic-proposals.contributors';

describe('Academic proposals account export contributor', () => {
  it("exports only the owner's submitted proposal fields as opaque references", async () => {
    const listAccountExportProposals = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'proposal-stable-id',
          kind: 'program',
          proposedName: 'Programa propuesto',
          parentIds: ['institution-ref'],
          evidenceUrl: 'https://example.test/program',
          notes: 'Owner-authored context',
          createdAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'proposal-next',
    });
    const academic = {
      listAccountExportProposals,
    } as unknown as jest.Mocked<AcademicService>;

    const page = await new AcademicProposalsExportContributor(
      academic,
    ).readPage({
      userId: 'owner-user',
      cursor: null,
      limit: 100,
    });

    expect(page).toEqual({
      records: [
        {
          id: 'proposal-stable-id',
          kind: 'program',
          proposedName: 'Programa propuesto',
          parentIds: ['institution-ref'],
          evidenceUrl: 'https://example.test/program',
          notes: 'Owner-authored context',
          createdAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'proposal-next',
    });
    for (const key of [
      'userId',
      'status',
      'updatedAt',
      'reviewedByUserId',
      'reviewedAt',
      'reviewReason',
      'canonicalTargetId',
      'provenance',
      'audit',
    ]) {
      expect(page.records[0]).not.toHaveProperty(key);
    }
    expect(listAccountExportProposals).toHaveBeenCalledWith('owner-user', {
      limit: 100,
      cursor: null,
    });
  });
});
