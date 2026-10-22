import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import {
  AccountExportContributorRegistry,
  accountExportSectionIds,
  assertAccountExportSections,
} from './account-export-contributor.registry';
import { AccountExportService } from './account-export.service';
import {
  type AccountExportAssemblyResult,
  type AccountExportFormatVersion,
  ACCOUNT_EXPORT_FORMAT,
} from './account-export.types';

export type { AccountExportAssemblyResult } from './account-export.types';

export interface AccountExportArtifactSink {
  write(chunk: string): Promise<void>;
  commit(result: AccountExportAssemblyResult): Promise<void>;
  abort(): Promise<void>;
}

@Injectable()
export class AccountExportAssembler {
  constructor(
    private readonly registry: AccountExportContributorRegistry,
    private readonly exports: AccountExportService,
  ) {}

  async writeJsonV1(
    userId: string,
    sink: AccountExportArtifactSink,
    canContinue?: () => Promise<boolean>,
  ): Promise<AccountExportAssemblyResult> {
    return this.writeJsonForVersion(1, userId, sink, canContinue);
  }

  async writeJsonV2(
    userId: string,
    sink: AccountExportArtifactSink,
    canContinue?: () => Promise<boolean>,
  ): Promise<AccountExportAssemblyResult> {
    return this.writeJsonForVersion(2, userId, sink, canContinue);
  }

  async writeJsonV3(
    userId: string,
    sink: AccountExportArtifactSink,
    canContinue?: () => Promise<boolean>,
  ): Promise<AccountExportAssemblyResult> {
    return this.writeJsonForVersion(3, userId, sink, canContinue);
  }

  private async writeJsonForVersion(
    version: AccountExportFormatVersion,
    userId: string,
    sink: AccountExportArtifactSink,
    canContinue?: () => Promise<boolean>,
  ): Promise<AccountExportAssemblyResult> {
    const expected = accountExportSectionIds(version);
    const contributors = expected.map((id) => this.registry.require(id));
    // Legacy jobs select precisely their own versioned manifest even after
    // v3 deployment. The real Nest module enforces the complete v3 inventory.
    assertAccountExportSections(
      version === 3 ? this.registry.list() : contributors,
      version,
    );
    let recordCount = 0;
    let byteLength = 0;
    const sha256 = createHash('sha256');

    const assertClaim = async () => {
      if (canContinue && !(await canContinue())) {
        throw new Error('Account export worker claim is no longer active');
      }
    };

    const writeChunk = async (chunk: string) => {
      await assertClaim();
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
      // Only v3 contains private Study Progress. The lifecycle epoch is
      // incremented transactionally by every supported progress mutation.
      // A v3 artifact assembled across different epochs must never publish.
      const studyProgressEpoch =
        version === 3
          ? await this.exports.captureStudyProgressExportEpoch(userId)
          : null;
      await writeChunk(
        `{"format":${JSON.stringify(ACCOUNT_EXPORT_FORMAT)},"version":${version},"sections":{`,
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
          await assertClaim();
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
      const result: AccountExportAssemblyResult = {
        format: ACCOUNT_EXPORT_FORMAT,
        formatVersion: version,
        sectionCount: contributors.length,
        recordCount,
        byteLength,
        sha256: sha256.digest('hex'),
      };
      await this.exports.assertActiveAccount(userId);
      await assertClaim();
      if (studyProgressEpoch !== null) {
        await this.exports.assertStudyProgressExportEpoch(
          userId,
          studyProgressEpoch,
        );
      }
      await assertClaim();
      await sink.commit(result);
      return result;
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
