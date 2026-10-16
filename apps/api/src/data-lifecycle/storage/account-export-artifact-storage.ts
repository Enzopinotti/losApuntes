import { createHash } from 'node:crypto';

import type { AccountExportArtifactSink } from '../domain/account-export-assembler';
import type { AccountExportAssemblyResult } from '../domain/account-export.types';
import { accountExportSectionIds } from '../domain/account-export-contributor.registry';
import type { S3ObjectStorage } from '../../files/storage/s3-object-storage';

export type AccountExportArtifactObjectStorage = Pick<
  S3ObjectStorage,
  'createMultipartWriter' | 'readObjectChunks' | 'deleteObject'
>;

export const ACCOUNT_EXPORT_ARTIFACT_STORAGE = Symbol(
  'ACCOUNT_EXPORT_ARTIFACT_STORAGE',
);

export interface AccountExportArtifactStorage {
  createSink(jobId: string, generation: string): AccountExportArtifactSink;
  readObjectChunks(
    jobId: string,
    generation: string,
    signal?: AbortSignal,
  ): AsyncIterable<Uint8Array>;
  deleteArtifact(jobId: string, generation: string): Promise<void>;
}

function objectKey(jobId: string, generation: string): string {
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
  if (!uuid.test(jobId) || !uuid.test(generation)) {
    throw new Error('Account export artifact generation is invalid');
  }
  return `exports/${jobId}/${generation}.json`;
}

export class S3AccountExportArtifactStorage implements AccountExportArtifactStorage {
  constructor(private readonly storage: AccountExportArtifactObjectStorage) {}

  createSink(jobId: string, generation: string): AccountExportArtifactSink {
    const key = objectKey(jobId, generation);
    const writer = this.storage.createMultipartWriter({
      objectKey: key,
      contentType: 'application/json; charset=utf-8',
      // B81: an S3 commit can succeed after its ACK is lost. Never DELETE
      // the completed object from abort(); the durable B80 orphan ledger
      // and B78 owner-fenced cleanup worker alone decide object deletion.
      deleteObjectOnAbort: false,
    });
    const digest = createHash('sha256');
    let byteLength = 0;
    let state: 'staging' | 'committed' | 'aborted' = 'staging';

    return {
      async write(chunk: string): Promise<void> {
        if (state !== 'staging') {
          throw new Error('Account export artifact sink is not writable');
        }
        const bytes = Buffer.from(chunk, 'utf8');
        await writer.write(bytes);
        digest.update(bytes);
        byteLength += bytes.byteLength;
      },

      async commit(result: AccountExportAssemblyResult): Promise<void> {
        if (state !== 'staging') {
          throw new Error('Account export artifact sink is not staging');
        }
        const actualDigest = digest.digest('hex');
        if (
          result.byteLength !== byteLength ||
          result.sha256 !== actualDigest ||
          result.format !== 'los-apuntes-account-export' ||
          ![1, 2, 3].includes(result.formatVersion) ||
          result.sectionCount !== accountExportSectionIds(result.formatVersion).length
        ) {
          throw new Error('Account export artifact integrity check failed');
        }
        await writer.complete();
        state = 'committed';
      },

      async abort(): Promise<void> {
        if (state === 'aborted') return;
        await writer.abort();
        state = 'aborted';
      },
    };
  }

  readObjectChunks(
    jobId: string,
    generation: string,
    signal?: AbortSignal,
  ): AsyncIterable<Uint8Array> {
    const key = objectKey(jobId, generation);
    return signal
      ? this.storage.readObjectChunks(key, undefined, signal)
      : this.storage.readObjectChunks(key);
  }

  deleteArtifact(jobId: string, generation: string): Promise<void> {
    return this.storage.deleteObject(objectKey(jobId, generation));
  }
}
