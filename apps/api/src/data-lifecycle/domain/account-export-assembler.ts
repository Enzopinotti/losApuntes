import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { AccountExportContributorRegistry } from './account-export-contributor.registry';
import { AccountExportService } from './account-export.service';
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_FORMAT_VERSION,
} from './account-export.types';

export interface AccountExportArtifactSink {
  write(chunk: string): Promise<void>;
  abort(): Promise<void>;
}

export type AccountExportAssemblyResult = {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  formatVersion: typeof ACCOUNT_EXPORT_FORMAT_VERSION;
  sectionCount: number;
  recordCount: number;
  byteLength: number;
  sha256: string;
};

@Injectable()
export class AccountExportAssembler {
  constructor(
    private readonly registry: AccountExportContributorRegistry,
    private readonly exports: AccountExportService,
  ) {}

  async writeJsonV1(
    userId: string,
    sink: AccountExportArtifactSink,
  ): Promise<AccountExportAssemblyResult> {
    const contributors = this.registry.list();
    let recordCount = 0;
    let byteLength = 0;
    const sha256 = createHash('sha256');

    const writeChunk = async (chunk: string) => {
      const chunkByteLength = Buffer.byteLength(chunk, 'utf8');
      if (byteLength + chunkByteLength > Number.MAX_SAFE_INTEGER) {
        throw new Error(
          'Account export artifact exceeds supported byte length',
        );
      }

      await sink.write(chunk);
      sha256.update(chunk, 'utf8');
      byteLength += chunkByteLength;
    };

    try {
      await writeChunk(
        `{"format":${JSON.stringify(ACCOUNT_EXPORT_FORMAT)},"version":${ACCOUNT_EXPORT_FORMAT_VERSION},"sections":{`,
      );

      for (const [sectionIndex, contributor] of contributors.entries()) {
        if (sectionIndex > 0) await writeChunk(',');
        await writeChunk(`${JSON.stringify(contributor.sectionId)}:[`);

        let cursor: string | null = null;
        let isFirstRecord = true;
        let cursorCheckpoint: string | null = null;
        let cursorCheckpointWindow = 1;
        let cursorsSinceCheckpoint = 0;

        while (true) {
          const page = await this.exports.readContributorPage(
            contributor,
            userId,
            cursor,
          );

          for (const record of page.records) {
            const serialized = JSON.stringify(record);
            if (typeof serialized !== 'string') {
              throw new Error(
                `Account export section ${contributor.sectionId} produced a non-JSON record`,
              );
            }

            if (!isFirstRecord) await writeChunk(',');
            await writeChunk(serialized);
            isFirstRecord = false;
            recordCount += 1;
          }

          const nextCursor = page.nextCursor;
          if (nextCursor === null) break;
          if (typeof nextCursor !== 'string' || nextCursor.length === 0) {
            throw new Error(
              `Account export section ${contributor.sectionId} produced an invalid cursor`,
            );
          }

          if (cursorCheckpoint === null) {
            cursorCheckpoint = nextCursor;
          } else {
            if (nextCursor === cursorCheckpoint) {
              throw new Error(
                `Account export section ${contributor.sectionId} repeated a cursor`,
              );
            }

            cursorsSinceCheckpoint += 1;
            if (cursorsSinceCheckpoint === cursorCheckpointWindow) {
              cursorCheckpoint = nextCursor;
              cursorCheckpointWindow = Math.min(
                cursorCheckpointWindow * 2,
                Number.MAX_SAFE_INTEGER,
              );
              cursorsSinceCheckpoint = 0;
            }
          }

          cursor = nextCursor;
        }

        await writeChunk(']');
      }

      await writeChunk('}}');
      return {
        format: ACCOUNT_EXPORT_FORMAT,
        formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
        sectionCount: contributors.length,
        recordCount,
        byteLength,
        sha256: sha256.digest('hex'),
      };
    } catch (error) {
      try {
        await sink.abort();
      } catch {
        // Preserve the assembly failure; the owning worker records it durably.
      }
      throw error;
    }
  }
}
