import { createHash } from 'node:crypto';

import type { S3ObjectStorage } from '../../files/storage/s3-object-storage';
import type { AccountExportAssemblyResult } from '../domain/account-export.types';
import { S3AccountExportArtifactStorage } from './account-export-artifact-storage';

const jobId = '123e4567-e89b-42d3-a456-426614174000';
const generation = '123e4567-e89b-42d3-a456-426614174001';

describe('S3AccountExportArtifactStorage', () => {
  it('stages bytes privately and publishes only a matching complete envelope', async () => {
    const writer = {
      write: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
    };
    const storage = {
      createMultipartWriter: jest.fn().mockReturnValue(writer),
      readObjectChunks: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<S3ObjectStorage>;
    const artifacts = new S3AccountExportArtifactStorage(storage);
    const sink = artifacts.createSink(jobId, generation);
    const content = '{"format":"los-apuntes-account-export"}';
    const result: AccountExportAssemblyResult = {
      format: 'los-apuntes-account-export',
      formatVersion: 1,
      sectionCount: 30,
      recordCount: 1,
      byteLength: Buffer.byteLength(content),
      sha256: createHash('sha256').update(content).digest('hex'),
    };

    await sink.write(content);
    await sink.commit(result);

    expect(storage.createMultipartWriter.mock.calls).toEqual([
      [
        {
          objectKey: `exports/${jobId}/${generation}.json`,
          contentType: 'application/json; charset=utf-8',
        },
      ],
    ]);
    expect(writer.write.mock.calls).toEqual([[Buffer.from(content)]]);
    expect(writer.complete).toHaveBeenCalledTimes(1);
    expect(writer.abort).not.toHaveBeenCalled();
  });

  it('rejects mismatched byte length or digest before publishing', async () => {
    const writer = {
      write: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
    };
    const artifacts = new S3AccountExportArtifactStorage({
      createMultipartWriter: jest.fn().mockReturnValue(writer),
    } as unknown as S3ObjectStorage);
    const sink = artifacts.createSink(jobId, generation);
    await sink.write('{"safe":true}');

    await expect(
      sink.commit({
        format: 'los-apuntes-account-export',
        formatVersion: 1,
        sectionCount: 30,
        recordCount: 1,
        byteLength: 1,
        sha256: 'a'.repeat(64),
      }),
    ).rejects.toThrow('integrity check failed');
    expect(writer.complete).not.toHaveBeenCalled();
  });

  it('derives storage paths only from canonical job and generation UUIDs', async () => {
    const readObjectChunks = jest
      .fn()
      .mockReturnValue((async function* () {})());
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const artifacts = new S3AccountExportArtifactStorage({
      readObjectChunks,
      deleteObject,
    } as unknown as S3ObjectStorage);

    artifacts.readObjectChunks(jobId, generation);
    await artifacts.deleteArtifact(jobId, generation);
    expect(readObjectChunks).toHaveBeenCalledWith(
      `exports/${jobId}/${generation}.json`,
    );
    expect(deleteObject).toHaveBeenCalledWith(
      `exports/${jobId}/${generation}.json`,
    );
    expect(() => artifacts.readObjectChunks('../foreign', generation)).toThrow(
      'generation is invalid',
    );
  });
});
