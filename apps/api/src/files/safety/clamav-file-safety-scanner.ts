import { once } from 'node:events';
import { createConnection, type Socket } from 'node:net';

import type {
  FileSafetyScanInput,
  FileSafetyScanner,
} from './file-safety-scanner';

const MAX_CLAMAV_FRAME_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 4096;

export type ClamAvFileSafetyScannerOptions = {
  host: string;
  port: number;
  timeoutMs: number;
};

function connect(
  options: ClamAvFileSafetyScannerOptions,
  timeoutMs = options.timeoutMs,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({
      host: options.host,
      port: options.port,
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('ClamAV connection timed out'));
    }, timeoutMs);

    const onError = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };

    socket.once('error', onError);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.off('error', onError);
      socket.setTimeout(timeoutMs);
      resolve(socket);
    });
  });
}

async function write(socket: Socket, bytes: Uint8Array): Promise<void> {
  if (socket.destroyed) throw new Error('ClamAV socket closed unexpectedly');
  if (socket.write(bytes)) return;
  await once(socket, 'drain');
}

function response(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = '';

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      socket.off('close', onClose);
    };
    const finish = (result: string) => {
      cleanup();
      resolve(result);
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      value += chunk.toString('utf8');
      if (Buffer.byteLength(value, 'utf8') > MAX_RESPONSE_BYTES) {
        fail(new Error('ClamAV response exceeded safe bound'));
        return;
      }
      const terminator = value.indexOf('\0');
      if (terminator >= 0) finish(value.slice(0, terminator).trim());
    };
    const onError = (error: Error) => fail(error);
    const onTimeout = () => fail(new Error('ClamAV scan timed out'));
    const onClose = () => {
      if (!value.includes('\0')) {
        fail(new Error('ClamAV closed before returning a verdict'));
      }
    };

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
    socket.once('close', onClose);
  });
}

function parseVerdict(raw: string) {
  if (raw.endsWith(' OK')) {
    return { verdict: 'clean' as const, engine: 'clamav-instream-v1' };
  }
  if (raw.includes(' FOUND')) {
    return { verdict: 'malicious' as const, engine: 'clamav-instream-v1' };
  }
  throw new Error('ClamAV returned an invalid scan response');
}

export function createClamAvFileSafetyScanner(
  options: ClamAvFileSafetyScannerOptions,
): FileSafetyScanner {
  return Object.freeze({
    async probe(timeoutMs = 1_500) {
      const boundedTimeoutMs = Math.max(
        250,
        Math.min(timeoutMs, options.timeoutMs),
      );
      const socket = await connect(options, boundedTimeoutMs);

      try {
        await write(socket, Buffer.from('zPING\0', 'ascii'));
        const raw = await response(socket);
        if (raw !== 'PONG') {
          throw new Error('ClamAV health probe returned an invalid response');
        }
        return {
          status: 'ok' as const,
          engine: 'clamav-instream-v1',
        };
      } finally {
        socket.destroy();
      }
    },

    async scan(input: FileSafetyScanInput) {
      const socket = await connect(options);

      try {
        await write(socket, Buffer.from('zINSTREAM\0', 'ascii'));
        let seenBytes = 0;

        for await (const chunk of input.chunks) {
          seenBytes += chunk.byteLength;
          if (seenBytes > input.byteSize) {
            throw new Error('Scanner stream exceeded verified byte size');
          }

          for (
            let offset = 0;
            offset < chunk.byteLength;
            offset += MAX_CLAMAV_FRAME_BYTES
          ) {
            const frame = chunk.subarray(
              offset,
              Math.min(offset + MAX_CLAMAV_FRAME_BYTES, chunk.byteLength),
            );
            const length = Buffer.allocUnsafe(4);
            length.writeUInt32BE(frame.byteLength, 0);
            await write(socket, length);
            await write(socket, frame);
          }
        }

        if (seenBytes !== input.byteSize) {
          throw new Error('Scanner stream did not match verified byte size');
        }

        await write(socket, Buffer.alloc(4));
        const raw = await response(socket);
        return parseVerdict(raw);
      } finally {
        socket.destroy();
      }
    },
  });
}
