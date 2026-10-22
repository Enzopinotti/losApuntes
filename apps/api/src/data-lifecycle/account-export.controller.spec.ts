import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

import type { AuthenticatedRequest } from '../auth/auth.types';
import type { AccountExportService } from './domain/account-export.service';
import type { AccountExportFormatVersion } from './domain/account-export.types';
import type { AccountExportArtifactStorage } from './storage/account-export-artifact-storage';
import { AccountExportController } from './account-export.controller';

const exportId = '123e4567-e89b-42d3-a456-426614174000';
const digest = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const exports = {
    request: jest
      .fn()
      .mockResolvedValue({ created: true, export: { id: exportId } }),
    status: jest.fn(),
    download: jest.fn(),
  } as unknown as jest.Mocked<AccountExportService>;
  const artifacts = {
    verifyReadable: jest.fn().mockResolvedValue(undefined),
    readObjectChunks: jest.fn(),
  } as unknown as jest.Mocked<AccountExportArtifactStorage>;
  const controller = new AccountExportController(exports, artifacts);
  const request = { user: { id: 'owner-1' } } as AuthenticatedRequest;
  return { exports, artifacts, controller, request };
}

describe('AccountExportController', () => {
  it('creates or replays an authenticated request with HTTP 202 metadata', async () => {
    const f = fixture();

    await expect(f.controller.request(f.request)).resolves.toEqual({
      created: true,
      export: { id: exportId },
    });
    expect(f.exports.request.mock.calls).toEqual([['owner-1']]);
  });

  it('hides missing and foreign status jobs behind the same 404', async () => {
    const f = fixture();
    f.exports.status.mockResolvedValueOnce(null);

    await expect(
      f.controller.status(f.request, exportId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.exports.status.mock.calls).toEqual([['owner-1', exportId]]);
  });

  it('hides a foreign artifact download behind 404 before reading storage', async () => {
    const f = fixture();
    const foreignRequest = {
      user: { id: 'other-user' },
    } as AuthenticatedRequest;
    const reply = {
      raw: new EventEmitter(),
      header: jest
        .fn<unknown, [name: string, value: string | number]>()
        .mockReturnThis(),
      send: jest.fn<unknown, [payload: unknown]>().mockReturnThis(),
    };
    f.exports.download.mockResolvedValueOnce({ kind: 'not_found' });

    await expect(
      f.controller.download(foreignRequest, exportId, reply as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(f.exports.download.mock.calls).toEqual([['other-user', exportId]]);
    expect(f.artifacts.verifyReadable.mock.calls).toHaveLength(0);
    expect(f.artifacts.readObjectChunks.mock.calls).toHaveLength(0);
    expect(reply.send.mock.calls).toHaveLength(0);
  });

  it('B91 preflights exact owner and generation before response headers or streaming', async () => {
    const f = fixture();
    const generation = '123e4567-e89b-42d3-a456-426614174001';
    const bytes = Buffer.from('{"owner":"verified"}');
    const sha256 = digest(bytes);
    f.exports.download.mockResolvedValue({
      kind: 'available',
      formatVersion: 1,
      generation,
      byteLength: bytes.length,
      sha256,
    });
    let release!: () => void;
    const preflightBlocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.artifacts.verifyReadable.mockImplementationOnce(async () => {
      await preflightBlocked;
    });
    f.artifacts.readObjectChunks.mockReturnValueOnce(
      (async function* () {
        yield await Promise.resolve(bytes);
      })(),
    );
    const raw = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableFinished: false,
    });
    const reply = {
      raw,
      header: jest
        .fn<unknown, [name: string, value: string | number]>()
        .mockReturnThis(),
      send: jest.fn<unknown, [payload: unknown]>().mockReturnThis(),
    };
    const downloading = f.controller.download(
      f.request,
      exportId,
      reply as never,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(reply.header.mock.calls).toHaveLength(0);
    expect(reply.send.mock.calls).toHaveLength(0);
    expect(f.artifacts.readObjectChunks.mock.calls).toHaveLength(0);
    release();
    await downloading;
    expect(f.artifacts.verifyReadable.mock.calls).toContainEqual([
      exportId,
      generation,
      { byteLength: bytes.length, sha256 },
      expect.any(AbortSignal),
    ]);
    expect(f.artifacts.readObjectChunks.mock.calls).toHaveLength(1);
    expect(reply.header.mock.calls).toContainEqual([
      'content-length',
      bytes.length,
    ]);
    expect(reply.send.mock.calls).toHaveLength(1);
    raw.emit('finish');
  });

  it.each(['corrupt', 'truncated', 'missing', 'provider down'])(
    'B91 refuses an unverified %s export with stable 503 before emitting private bytes',
    async () => {
      const f = fixture();
      const generation = '123e4567-e89b-42d3-a456-426614174001';
      f.exports.download.mockResolvedValue({
        kind: 'available',
        formatVersion: 3,
        generation,
        byteLength: 128,
        sha256: 'a'.repeat(64),
      });
      f.artifacts.verifyReadable.mockRejectedValueOnce(
        new Error(
          'provider internal object key exports/secret-user/stale.json',
        ),
      );
      const raw = Object.assign(new EventEmitter(), {
        destroyed: false,
        writableFinished: false,
      });
      const reply = {
        raw,
        header: jest
          .fn<unknown, [name: string, value: string | number]>()
          .mockReturnThis(),
        send: jest.fn<unknown, [payload: unknown]>().mockReturnThis(),
      };
      const caught = await f.controller
        .download(f.request, exportId, reply as never)
        .catch((error: unknown) => error);
      expect(caught).toBeInstanceOf(ServiceUnavailableException);
      const message = JSON.stringify(
        (caught as ServiceUnavailableException).getResponse(),
      );
      expect(message).toContain('ACCOUNT_EXPORT_STORAGE_UNAVAILABLE');
      expect(message).not.toContain('secret-user');
      expect(reply.header.mock.calls).toHaveLength(0);
      expect(reply.send.mock.calls).toHaveLength(0);
      expect(f.artifacts.readObjectChunks.mock.calls).toHaveLength(0);
      expect(raw.listenerCount('close')).toBe(0);
      expect(raw.listenerCount('finish')).toBe(0);
    },
  );

  it('B91 aborts a disconnected client during S3 preflight without starting download', async () => {
    const f = fixture();
    f.exports.download.mockResolvedValue({
      kind: 'available',
      formatVersion: 1,
      generation: '123e4567-e89b-42d3-a456-426614174001',
      byteLength: 1,
      sha256: digest('x'),
    });
    let observedSignal: AbortSignal | undefined;
    f.artifacts.verifyReadable.mockImplementationOnce(
      (_jobId, _generation, _expected, signal) => {
        observedSignal = signal;
        return new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      },
    );
    const raw = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableFinished: false,
    });
    const reply = {
      raw,
      header: jest
        .fn<unknown, [name: string, value: string | number]>()
        .mockReturnThis(),
      send: jest.fn<unknown, [payload: unknown]>().mockReturnThis(),
    };
    const running = f.controller.download(f.request, exportId, reply as never);
    await Promise.resolve();
    await Promise.resolve();
    // The preflight receives the connection abort, without HTTP headers.
    raw.emit('close');
    await expect(running).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(observedSignal?.aborted).toBe(true);
    expect(reply.send.mock.calls).toHaveLength(0);
    expect(reply.header.mock.calls).toHaveLength(0);
  });

  it.each([
    ['not_found', NotFoundException],
    ['not_ready', ConflictException],
    ['expired', GoneException],
  ] as const)(
    'B92 fails closed if durable export becomes %s while S3 preflight reads',
    async (kind, exceptionType) => {
      const f = fixture();
      f.exports.download
        .mockResolvedValueOnce({
          kind: 'available',
          formatVersion: 1,
          generation: '123e4567-e89b-42d3-a456-426614174001',
          byteLength: 1,
          sha256: digest('x'),
        })
        .mockResolvedValueOnce({ kind });
      const raw = Object.assign(new EventEmitter(), {
        destroyed: false,
        writableFinished: false,
      });
      const reply = {
        raw,
        header: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
      await expect(
        f.controller.download(f.request, exportId, reply as never),
      ).rejects.toBeInstanceOf(exceptionType);
      expect(f.artifacts.verifyReadable.mock.calls).toHaveLength(1);
      expect(f.exports.download.mock.calls).toHaveLength(2);
      expect(reply.header.mock.calls).toHaveLength(0);
      expect(reply.send.mock.calls).toHaveLength(0);
      expect(f.artifacts.readObjectChunks.mock.calls).toHaveLength(0);
      expect(raw.listenerCount('close')).toBe(0);
    },
  );

  it.each([
    {
      changes: { generation: '123e4567-e89b-42d3-a456-426614174002' },
      field: 'generation',
    },
    { changes: { byteLength: 99 }, field: 'size' },
    { changes: { sha256: 'b'.repeat(64) }, field: 'digest' },
    { changes: { formatVersion: 2 as const }, field: 'version' },
  ])(
    'B92 refuses a changed $field after preflight with a safe 409',
    async ({ changes }) => {
      const f = fixture();
      const original = {
        kind: 'available' as const,
        formatVersion: 1 as const,
        generation: '123e4567-e89b-42d3-a456-426614174001',
        byteLength: 64,
        sha256: 'a'.repeat(64),
      };
      f.exports.download
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce({ ...original, ...changes });
      const raw = Object.assign(new EventEmitter(), {
        destroyed: false,
        writableFinished: false,
      });
      const reply = {
        raw,
        header: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
      const rejected = await f.controller
        .download(f.request, exportId, reply as never)
        .catch((error: unknown) => error);
      expect(rejected).toBeInstanceOf(ConflictException);
      expect(
        JSON.stringify((rejected as ConflictException).getResponse()),
      ).toContain('ACCOUNT_EXPORT_CHANGED_DURING_VERIFICATION');
      expect(reply.header.mock.calls).toHaveLength(0);
      expect(reply.send.mock.calls).toHaveLength(0);
      expect(f.artifacts.readObjectChunks.mock.calls).toHaveLength(0);
    },
  );

  it('B92 owner revocation during preflight keeps service authorization error', async () => {
    const f = fixture();
    f.exports.download
      .mockResolvedValueOnce({
        kind: 'available',
        formatVersion: 1,
        generation: '123e4567-e89b-42d3-a456-426614174001',
        byteLength: 1,
        sha256: digest('x'),
      })
      .mockRejectedValueOnce(
        new ForbiddenException({
          code: 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE',
        }),
      );
    const raw = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableFinished: false,
    });
    const reply = {
      raw,
      header: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    await expect(
      f.controller.download(f.request, exportId, reply as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(reply.header.mock.calls).toHaveLength(0);
    expect(reply.send.mock.calls).toHaveLength(0);
    expect(raw.listenerCount('close')).toBe(0);
  });

  it('B92 does not send if connection closes while Mongo reauthorization is pending', async () => {
    const f = fixture();
    const original = {
      kind: 'available' as const,
      formatVersion: 1 as const,
      generation: '123e4567-e89b-42d3-a456-426614174001',
      byteLength: 1,
      sha256: digest('x'),
    };
    let resume!: (value: typeof original) => void;
    const rechecked = new Promise<typeof original>((resolve) => {
      resume = resolve;
    });
    f.exports.download
      .mockResolvedValueOnce(original)
      .mockReturnValueOnce(rechecked);
    const raw = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableFinished: false,
    });
    const reply = {
      raw,
      header: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    const downloading = f.controller.download(
      f.request,
      exportId,
      reply as never,
    );
    await Promise.resolve();
    await Promise.resolve();
    raw.emit('close');
    resume(original);
    await expect(downloading).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(reply.header.mock.calls).toHaveLength(0);
    expect(reply.send.mock.calls).toHaveLength(0);
  });

  it('streams an owner-authorized artifact with private no-store headers', async () => {
    const f = fixture();
    const content = Buffer.from('{"portable":true}', 'utf8');
    f.exports.download.mockResolvedValue({
      kind: 'available',
      formatVersion: 1,
      generation: '123e4567-e89b-42d3-a456-426614174001',
      byteLength: content.byteLength,
      sha256: digest(content),
    });
    f.artifacts.readObjectChunks.mockReturnValueOnce(
      (async function* () {
        await Promise.resolve();
        yield content.subarray(0, 8);
        yield content.subarray(8);
      })(),
    );
    const raw = Object.assign(new EventEmitter(), { writableFinished: true });
    const reply = {
      raw,
      header: jest
        .fn<unknown, [name: string, value: string | number]>()
        .mockReturnThis(),
      send: jest.fn<unknown, [payload: unknown]>().mockReturnThis(),
    };

    await f.controller.download(f.request, exportId, reply as never);
    raw.emit('finish');

    expect(f.exports.download.mock.calls).toEqual([
      ['owner-1', exportId],
      ['owner-1', exportId],
    ]);
    expect(reply.header.mock.calls).toContainEqual([
      'content-type',
      'application/json; charset=utf-8',
    ]);
    expect(reply.header.mock.calls).toContainEqual([
      'content-disposition',
      'attachment; filename="los-apuntes-account-export-v1.json"',
    ]);
    expect(reply.header.mock.calls).toContainEqual([
      'cache-control',
      'private, no-store',
    ]);
    expect(reply.header.mock.calls).toContainEqual([
      'content-length',
      content.byteLength,
    ]);
    const headerCalls = reply.header.mock.calls as Array<
      [string, string | number]
    >;
    expect(headerCalls.map(([name]) => name)).not.toContain('location');
    const sendCalls = reply.send.mock.calls as Array<[unknown]>;
    const stream = sendCalls[0]?.[0] as Readable;
    const received: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      received.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(received)).toEqual(content);
  });

  it('aborts the provider read when the response closes before finishing', async () => {
    const f = fixture();
    f.exports.download.mockResolvedValue({
      kind: 'available',
      formatVersion: 1,
      generation: '123e4567-e89b-42d3-a456-426614174001',
      byteLength: 64,
      sha256: 'a'.repeat(64),
    });
    let signal: AbortSignal | undefined;
    let finishRead!: () => void;
    const readFinished = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    f.artifacts.readObjectChunks.mockImplementationOnce(
      (_jobId, _generation, readSignal) => {
        signal = readSignal;
        return (async function* () {
          try {
            yield Buffer.from('first chunk');
            await new Promise<void>((resolve) =>
              readSignal?.addEventListener('abort', () => resolve(), {
                once: true,
              }),
            );
          } finally {
            finishRead();
          }
        })();
      },
    );
    const raw = Object.assign(new EventEmitter(), { writableFinished: false });
    const reply = {
      raw,
      header: jest
        .fn<unknown, [name: string, value: string | number]>()
        .mockReturnThis(),
      send: jest
        .fn<unknown, [payload: unknown]>()
        .mockImplementation((payload) => payload),
    };

    await f.controller.download(f.request, exportId, reply as never);
    const stream = reply.send.mock.calls[0]?.[0] as Readable;
    const streamReader = stream[Symbol.asyncIterator]();
    await expect(streamReader.next()).resolves.toMatchObject({ done: false });
    raw.emit('close');

    expect(signal?.aborted).toBe(true);
    await expect(readFinished).resolves.toBeUndefined();
    stream.destroy();
  });

  it('does not abort a completed response when its connection closes', async () => {
    const f = fixture();
    f.exports.download.mockResolvedValue({
      kind: 'available',
      formatVersion: 1,
      generation: '123e4567-e89b-42d3-a456-426614174001',
      byteLength: 1,
      sha256: digest('x'),
    });
    f.artifacts.readObjectChunks.mockReturnValueOnce(
      (async function* () {
        await Promise.resolve();
        yield Buffer.from('x');
      })(),
    );
    const raw = Object.assign(new EventEmitter(), { writableFinished: true });
    const reply = {
      raw,
      header: jest
        .fn<unknown, [name: string, value: string | number]>()
        .mockReturnThis(),
      send: jest.fn<unknown, [payload: unknown]>().mockReturnThis(),
    };

    await f.controller.download(f.request, exportId, reply as never);
    const signal = f.artifacts.readObjectChunks.mock.calls[0]?.[2];
    raw.emit('finish');
    raw.emit('close');

    expect(signal?.aborted).toBe(false);
  });

  it('uses stable errors for unavailable and expired artifacts', async () => {
    const f = fixture();
    const reply = {
      header: jest
        .fn<unknown, [name: string, value: string | number]>()
        .mockReturnThis(),
      send: jest.fn<unknown, [payload: unknown]>(),
    };
    f.exports.download
      .mockResolvedValueOnce({ kind: 'not_ready' })
      .mockResolvedValueOnce({ kind: 'expired' })
      .mockResolvedValueOnce({ kind: 'not_found' });

    await expect(
      f.controller.download(f.request, exportId, reply as never),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      f.controller.download(f.request, exportId, reply as never),
    ).rejects.toBeInstanceOf(GoneException);
    await expect(
      f.controller.download(f.request, exportId, reply as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.artifacts.readObjectChunks.mock.calls).toHaveLength(0);
  });
  it('names an owner-authorized v2 artifact as v2, not legacy v1', async () => {
    const f = fixture();
    const content = Buffer.from(
      '{"format":"los-apuntes-account-export","version":2}',
      'utf8',
    );
    f.exports.download.mockResolvedValue({
      kind: 'available',
      formatVersion: 2,
      generation: '123e4567-e89b-42d3-a456-426614174001',
      byteLength: content.byteLength,
      sha256: digest(content),
    });
    f.artifacts.readObjectChunks.mockReturnValueOnce(
      (async function* () {
        yield await Promise.resolve(content);
      })(),
    );
    const raw = Object.assign(new EventEmitter(), { writableFinished: true });
    const reply = {
      raw,
      header: jest
        .fn<unknown, [name: string, value: string | number]>()
        .mockReturnThis(),
      send: jest.fn<unknown, [payload: unknown]>().mockReturnThis(),
    };
    await f.controller.download(f.request, exportId, reply as never);
    expect(reply.header.mock.calls).toContainEqual([
      'content-disposition',
      'attachment; filename="los-apuntes-account-export-v2.json"',
    ]);
    expect(reply.header.mock.calls).toContainEqual([
      'cache-control',
      'private, no-store',
    ]);
    raw.emit('finish');
  });

  it('accepts version-three export artifacts using the existing download contract', async () => {
    const f = fixture();
    f.exports.download.mockResolvedValue({
      kind: 'available',
      formatVersion: 3,
      generation: '123e4567-e89b-42d3-a456-426614174001',
      byteLength: 1,
      sha256: digest('x'),
    });
    f.artifacts.readObjectChunks.mockReturnValueOnce(
      (async function* () {
        yield await Promise.resolve(Buffer.from('x'));
      })(),
    );
    const raw = Object.assign(new EventEmitter(), { writableFinished: true });
    const reply = {
      raw,
      header: jest
        .fn<unknown, [name: string, value: string | number]>()
        .mockReturnThis(),
      send: jest.fn<unknown, [payload: unknown]>().mockReturnThis(),
    };
    await f.controller.download(f.request, exportId, reply as never);
    expect(reply.header.mock.calls).toContainEqual([
      'content-disposition',
      'attachment; filename="los-apuntes-account-export-v3.json"',
    ]);
    raw.emit('finish');
  });

  it('refuses malformed artifact versions before reading private storage', async () => {
    const f = fixture();
    f.exports.download.mockResolvedValueOnce({
      kind: 'available',
      // Deliberately violate the persisted-format contract to prove that the
      // controller fails closed before reading private storage.
      formatVersion: 99 as unknown as AccountExportFormatVersion,
      generation: '123e4567-e89b-42d3-a456-426614174001',
      byteLength: 512,
      sha256: 'a'.repeat(64),
    });
    const reply = {
      header: jest
        .fn<unknown, [name: string, value: string | number]>()
        .mockReturnThis(),
      send: jest.fn<unknown, [payload: unknown]>().mockReturnThis(),
    };
    await expect(
      f.controller.download(f.request, exportId, reply as never),
    ).rejects.toThrow();
    expect(f.artifacts.readObjectChunks.mock.calls).toHaveLength(0);
  });
});
