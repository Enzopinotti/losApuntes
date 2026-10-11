import {
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

import type { AuthenticatedRequest } from '../auth/auth.types';
import type { AccountExportService } from './domain/account-export.service';
import type { AccountExportArtifactStorage } from './storage/account-export-artifact-storage';
import { AccountExportController } from './account-export.controller';

const exportId = '123e4567-e89b-42d3-a456-426614174000';

function fixture() {
  const exports = {
    request: jest
      .fn()
      .mockResolvedValue({ created: true, export: { id: exportId } }),
    status: jest.fn(),
    download: jest.fn(),
  } as unknown as jest.Mocked<AccountExportService>;
  const artifacts = {
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
    expect(f.artifacts.readObjectChunks.mock.calls).toHaveLength(0);
    expect(reply.send.mock.calls).toHaveLength(0);
  });

  it('streams an owner-authorized artifact with private no-store headers', async () => {
    const f = fixture();
    const content = Buffer.from('{"portable":true}', 'utf8');
    f.exports.download.mockResolvedValueOnce({
      kind: 'available',
      generation: '123e4567-e89b-42d3-a456-426614174001',
      byteLength: content.byteLength,
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

    expect(f.exports.download.mock.calls).toEqual([['owner-1', exportId]]);
    expect(reply.header).toHaveBeenCalledWith(
      'content-type',
      'application/json; charset=utf-8',
    );
    expect(reply.header).toHaveBeenCalledWith(
      'content-disposition',
      'attachment; filename="los-apuntes-account-export-v1.json"',
    );
    expect(reply.header).toHaveBeenCalledWith(
      'cache-control',
      'private, no-store',
    );
    expect(reply.header).toHaveBeenCalledWith(
      'content-length',
      content.byteLength,
    );
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
    f.exports.download.mockResolvedValueOnce({
      kind: 'available',
      generation: '123e4567-e89b-42d3-a456-426614174001',
      byteLength: 64,
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
    f.exports.download.mockResolvedValueOnce({
      kind: 'available',
      generation: '123e4567-e89b-42d3-a456-426614174001',
      byteLength: 1,
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
});
