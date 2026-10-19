import { createHash } from 'node:crypto';

import type { AccountExportAssemblyResult } from '../domain/account-export.types';
import {
  S3AccountExportArtifactStorage,
  type AccountExportArtifactObjectStorage,
} from './account-export-artifact-storage';

const jobId = '123e4567-e89b-42d3-a456-426614174000';
const generation = '123e4567-e89b-42d3-a456-426614174001';

describe('S3AccountExportArtifactStorage', () => {
  it('stages bytes privately and publishes only a matching complete envelope', async () => {
    const writer = {
      write: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
    };
    const storage: jest.Mocked<AccountExportArtifactObjectStorage> = {
      createMultipartWriter: jest.fn().mockReturnValue(writer),
      readObjectChunks: jest.fn().mockImplementation(() =>
        (async function* () {
          yield await Promise.resolve(Buffer.from('{"format":"los-apuntes-account-export"}'));
        })(),
      ),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
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
          deleteObjectOnAbort: false,
        },
      ],
    ]);
    expect(writer.write.mock.calls).toEqual([[Buffer.from(content)]]);
    expect(writer.complete).toHaveBeenCalledTimes(1);
    expect(writer.abort).not.toHaveBeenCalled();
  });

  it('commits valid v2 and v3 artifacts while preserving integrity checks', async () => {
    for (const [formatVersion, sectionCount] of [
      [2, 31],
      [3, 32],
    ] as const) {
      const writer = {
        write: jest.fn().mockResolvedValue(undefined),
        complete: jest.fn().mockResolvedValue(undefined),
        abort: jest.fn().mockResolvedValue(undefined),
      };
      const storage: jest.Mocked<AccountExportArtifactObjectStorage> = {
        createMultipartWriter: jest.fn().mockReturnValue(writer),
        readObjectChunks: jest.fn().mockImplementation(() =>
          (async function* () {
            yield await Promise.resolve(Buffer.from('{"export":true}'));
          })(),
        ),
        deleteObject: jest.fn().mockResolvedValue(undefined),
      };
      const artifact = new S3AccountExportArtifactStorage(storage);
      const sink = artifact.createSink(jobId, generation);
      const value = '{"export":true}';
      await sink.write(value);
      await sink.commit({
        format: 'los-apuntes-account-export',
        formatVersion,
        sectionCount,
        recordCount: 0,
        byteLength: Buffer.byteLength(value),
        sha256: createHash('sha256').update(value).digest('hex'),
      });
      expect(writer.complete).toHaveBeenCalledTimes(1);
    }
  });

  it('refuses an invalid section count before final S3 publish', async () => {
    const writer = {
      write: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
    };
    const storage: jest.Mocked<AccountExportArtifactObjectStorage> = {
      createMultipartWriter: jest.fn().mockReturnValue(writer),
      readObjectChunks: jest.fn().mockReturnValue((async function* () {})()),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const sink = new S3AccountExportArtifactStorage(storage).createSink(
      jobId,
      generation,
    );
    const value = 'artifact';
    await sink.write(value);
    await expect(
      sink.commit({
        format: 'los-apuntes-account-export',
        formatVersion: 3,
        sectionCount: 31,
        recordCount: 0,
        byteLength: Buffer.byteLength(value),
        sha256: createHash('sha256').update(value).digest('hex'),
      }),
    ).rejects.toThrow('integrity check failed');
    expect(writer.complete).not.toHaveBeenCalled();
  });

  it('rejects mismatched byte length or digest before publishing', async () => {
    const writer = {
      write: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
    };
    const storage: jest.Mocked<AccountExportArtifactObjectStorage> = {
      createMultipartWriter: jest.fn().mockReturnValue(writer),
      readObjectChunks: jest.fn().mockReturnValue((async function* () {})()),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const artifacts = new S3AccountExportArtifactStorage(storage);
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

  it('B90 refuses a truncated S3 readback after PUT ACK with no direct delete', async () => {
    const writer = {
      write: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
    };
    const storage: jest.Mocked<AccountExportArtifactObjectStorage> = {
      createMultipartWriter: jest.fn().mockReturnValue(writer),
      readObjectChunks: jest.fn().mockImplementation(() =>
        (async function* () {
          yield await Promise.resolve(Buffer.from('{"valid":'));
        })(),
      ),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const sink = new S3AccountExportArtifactStorage(storage).createSink(
      jobId,
      generation,
    );
    const body = '{"valid":true}';
    await sink.write(body);
    await expect(
      sink.commit({
        format: 'los-apuntes-account-export',
        formatVersion: 1,
        sectionCount: 30,
        recordCount: 1,
        byteLength: Buffer.byteLength(body),
        sha256: createHash('sha256').update(body).digest('hex'),
      }),
    ).rejects.toThrow('readback byte length mismatch');
    expect(writer.complete).toHaveBeenCalledTimes(1);
    await sink.abort();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('B90 refuses a same-length corrupt S3 readback before publishing', async () => {
    const writer = {
      write: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
    };
    const storage: jest.Mocked<AccountExportArtifactObjectStorage> = {
      createMultipartWriter: jest.fn().mockReturnValue(writer),
      readObjectChunks: jest.fn().mockImplementation(() =>
        (async function* () {
          yield await Promise.resolve(Buffer.from('{"valid":null}'));
        })(),
      ),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const body = '{"valid":true}';
    const sink = new S3AccountExportArtifactStorage(storage).createSink(
      jobId,
      generation,
    );
    await sink.write(body);
    const corrupted = '{"valid":null}';
    storage.readObjectChunks.mockImplementationOnce(() =>
      (async function* () {
        yield await Promise.resolve(Buffer.from(corrupted));
      })(),
    );
    await expect(
      sink.commit({
        format: 'los-apuntes-account-export',
        formatVersion: 1,
        sectionCount: 30,
        recordCount: 1,
        byteLength: Buffer.byteLength(body),
        sha256: createHash('sha256').update(body).digest('hex'),
      }),
    ).rejects.toThrow('readback SHA-256 mismatch');
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('B90 refuses a GET error despite a successful S3 write ACK', async () => {
    const writer = {
      write: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
    };
    const storage: jest.Mocked<AccountExportArtifactObjectStorage> = {
      createMultipartWriter: jest.fn().mockReturnValue(writer),
      readObjectChunks: jest.fn().mockImplementation(() =>
        (async function* () {
          yield await Promise.reject(new Error('S3 GET 503'));
        })(),
      ),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const body = '{"export":"private"}';
    const sink = new S3AccountExportArtifactStorage(storage).createSink(
      jobId,
      generation,
    );
    await sink.write(body);
    await expect(
      sink.commit({
        format: 'los-apuntes-account-export',
        formatVersion: 1,
        sectionCount: 30,
        recordCount: 1,
        byteLength: Buffer.byteLength(body),
        sha256: createHash('sha256').update(body).digest('hex'),
      }),
    ).rejects.toThrow('S3 GET 503');
    await sink.abort();
    expect(writer.complete).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('B71 treats a lost multipart completion ACK as ambiguous even after abort', async () => {
    const writer = {
      write: jest.fn().mockResolvedValue(undefined),
      complete: jest
        .fn()
        .mockRejectedValueOnce(new Error('S3 complete ACK lost')),
      abort: jest.fn().mockResolvedValue(undefined),
    };
    const storage: jest.Mocked<AccountExportArtifactObjectStorage> = {
      createMultipartWriter: jest.fn().mockReturnValue(writer),
      readObjectChunks: jest.fn().mockReturnValue((async function* () {})()),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const artifacts = new S3AccountExportArtifactStorage(storage);
    const sink = artifacts.createSink(jobId, generation);
    const payload = '{"ambiguous":true}';
    await sink.write(payload);
    await expect(
      sink.commit({
        format: 'los-apuntes-account-export',
        formatVersion: 1,
        sectionCount: 30,
        recordCount: 0,
        byteLength: Buffer.byteLength(payload),
        sha256: createHash('sha256').update(payload).digest('hex'),
      }),
    ).rejects.toThrow('S3 complete ACK lost');
    await sink.abort();
    expect(writer.complete).toHaveBeenCalledTimes(1);
    expect(writer.abort).toHaveBeenCalledTimes(1);
    // Aborting a multipart writer is NOT an exact-object DELETE; if the
    // commit already took effect, the processor must compensate after CAS.
    expect(storage.deleteObject).not.toHaveBeenCalled();
    await artifacts.deleteArtifact(jobId, generation);
    expect(storage.deleteObject).toHaveBeenCalledWith(
      `exports/${jobId}/${generation}.json`,
    );
  });

  it('B81 always opts private artifacts out of the S3 writer direct-delete abort path', async () => {
    const writer = {
      write: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockRejectedValue(new Error('unknown commit')),
      abort: jest.fn().mockResolvedValue(undefined),
    };
    const storage: jest.Mocked<AccountExportArtifactObjectStorage> = {
      createMultipartWriter: jest.fn().mockReturnValue(writer),
      readObjectChunks: jest.fn().mockReturnValue((async function* () {})()),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const sink = new S3AccountExportArtifactStorage(storage).createSink(
      jobId,
      generation,
    );
    const bytes = '{"unexpected":"ack"}';
    await sink.write(bytes);
    await expect(
      sink.commit({
        format: 'los-apuntes-account-export',
        formatVersion: 1,
        sectionCount: 30,
        recordCount: 1,
        byteLength: Buffer.byteLength(bytes),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }),
    ).rejects.toThrow('unknown commit');
    await sink.abort();
    await sink.abort();

    expect(storage.createMultipartWriter).toHaveBeenCalledWith({
      objectKey: `exports/${jobId}/${generation}.json`,
      contentType: 'application/json; charset=utf-8',
      deleteObjectOnAbort: false,
    });
    expect(writer.abort).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('B91 preflight accepts only exact-generation S3 bytes with bounded streaming hash', async () => {
    const bytes = Buffer.from('{"private":"correct"}');
    const readObjectChunks = jest.fn().mockImplementation(() =>
      (async function* () {
        yield await Promise.resolve(bytes.subarray(0, 7));
        yield await Promise.resolve(bytes.subarray(7));
      })(),
    );
    const store: jest.Mocked<AccountExportArtifactObjectStorage> = {
      createMultipartWriter: jest.fn(),
      readObjectChunks,
      deleteObject: jest.fn(),
    };
    const storage = new S3AccountExportArtifactStorage(store);
    const signal = new AbortController().signal;
    await expect(
      storage.verifyReadable(
        jobId,
        generation,
        {
          byteLength: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
        signal,
      ),
    ).resolves.toBeUndefined();
    expect(readObjectChunks).toHaveBeenCalledWith(
      `exports/${jobId}/${generation}.json`,
      undefined,
      signal,
    );
    expect(store.deleteObject).not.toHaveBeenCalled();
  });

  it('B91 preflight fails closed for equal-length corruption, truncation and S3 outage', async () => {
    const bytes = Buffer.from('{"private":"correct"}');
    const invalid = Buffer.from(bytes);
    invalid[7] ^= 1;
    const responses = [
      (async function* () {
        yield await Promise.resolve(invalid);
      })(),
      (async function* () {
        yield await Promise.resolve(bytes.subarray(0, bytes.length - 1));
      })(),
      (async function* () {
        yield await Promise.reject(new Error('S3 unavailable'));
      })(),
    ];
    const readObjectChunks = jest.fn();
    const store: jest.Mocked<AccountExportArtifactObjectStorage> = {
      createMultipartWriter: jest.fn(),
      readObjectChunks,
      deleteObject: jest.fn(),
    };
    const storage = new S3AccountExportArtifactStorage(store);
    const expected = {
      byteLength: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    for (const source of responses) {
      readObjectChunks.mockReturnValueOnce(source);
    }
    await expect(
      storage.verifyReadable(jobId, generation, expected),
    ).rejects.toThrow('SHA-256 mismatch');
    await expect(
      storage.verifyReadable(jobId, generation, expected),
    ).rejects.toThrow('byte length mismatch');
    await expect(
      storage.verifyReadable(jobId, generation, expected),
    ).rejects.toThrow('S3 unavailable');
    expect(store.deleteObject).not.toHaveBeenCalled();
  });

  it('derives storage paths only from canonical job and generation UUIDs', async () => {
    const readObjectChunks = jest
      .fn()
      .mockReturnValue((async function* () {})());
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const storage: jest.Mocked<AccountExportArtifactObjectStorage> = {
      createMultipartWriter: jest.fn().mockReturnValue({
        write: jest.fn().mockResolvedValue(undefined),
        complete: jest.fn().mockResolvedValue(undefined),
        abort: jest.fn().mockResolvedValue(undefined),
      }),
      readObjectChunks,
      deleteObject,
    };
    const artifacts = new S3AccountExportArtifactStorage(storage);
    const signal = new AbortController().signal;

    artifacts.readObjectChunks(jobId, generation);
    artifacts.readObjectChunks(jobId, generation, signal);
    await artifacts.deleteArtifact(jobId, generation);
    expect(readObjectChunks.mock.calls).toEqual([
      [`exports/${jobId}/${generation}.json`],
      [`exports/${jobId}/${generation}.json`, undefined, signal],
    ]);
    expect(deleteObject).toHaveBeenCalledWith(
      `exports/${jobId}/${generation}.json`,
    );
    expect(() => artifacts.readObjectChunks('../foreign', generation)).toThrow(
      'generation is invalid',
    );
  });
});
