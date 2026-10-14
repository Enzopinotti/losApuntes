import type { FileService } from '../../files/domain/file.service';
import { FileUploadsExportContributor } from './account-export-file.contributors';

describe('File uploads account export contributor', () => {
  it('exports owner file metadata only and normalizes unverified sizes', async () => {
    const listForAccountExport = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'asset-id',
          originalFilename: 'apunte.pdf',
          declaredMimeType: 'application/pdf',
          expectedByteSize: 128,
          createdAt: new Date('2026-10-11T12:00:00.000Z'),
        },
      ],
      nextCursor: 'opaque-next',
    });
    const files = {
      listForAccountExport,
    } as unknown as jest.Mocked<FileService>;

    const page = await new FileUploadsExportContributor(files).readPage({
      userId: 'owner-user',
      cursor: null,
      limit: 100,
    });

    expect(page).toEqual({
      records: [
        {
          id: 'asset-id',
          filename: 'apunte.pdf',
          declaredMimeType: 'application/pdf',
          verifiedMimeType: null,
          expectedByteSize: 128,
          actualByteSize: null,
          createdAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'opaque-next',
    });
    for (const key of [
      'creatorUserId',
      'userId',
      'provider',
      'objectKey',
      'uploadOperationKey',
      'uploadOperationFingerprint',
      'etag',
      'state',
      'failureCode',
      'scanClaimId',
      'claimRef',
      '_id',
      'bytes',
      'downloadUrl',
    ]) {
      expect(page.records[0]).not.toHaveProperty(key);
    }
    expect(listForAccountExport).toHaveBeenCalledWith({
      userId: 'owner-user',
      cursor: null,
      limit: 100,
    });
  });
});
