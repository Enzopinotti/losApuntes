import { Injectable } from '@nestjs/common';

import { FileService } from '../../files/domain/file.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class FileUploadsExportContributor implements AccountExportContributor {
  readonly sectionId = 'files.uploads';

  constructor(private readonly files: FileService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.files.listForAccountExport(input);

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        filename: row.originalFilename,
        declaredMimeType: row.declaredMimeType,
        verifiedMimeType: row.verifiedMimeType ?? null,
        expectedByteSize: row.expectedByteSize,
        actualByteSize: row.actualByteSize ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
