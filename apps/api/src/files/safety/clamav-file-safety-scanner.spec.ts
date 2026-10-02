import { createServer, type Server } from 'node:net';

import { createClamAvFileSafetyScanner } from './clamav-file-safety-scanner';

async function listen(response: string): Promise<{
  server: Server;
  port: number;
}> {
  const server = createServer((socket) => {
    socket.once('data', (chunk) => {
      if (chunk.toString('ascii').includes('zPING\0')) {
        socket.end(Buffer.from(`${response}\0`, 'ascii'));
      } else {
        socket.destroy();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('test server did not expose a TCP port');
  }

  return { server, port: address.port };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('ClamAvFileSafetyScanner health probe', () => {
  it('uses bounded PING/PONG without scanning file content', async () => {
    const runtime = await listen('PONG');
    try {
      const scanner = createClamAvFileSafetyScanner({
        host: '127.0.0.1',
        port: runtime.port,
        timeoutMs: 2_000,
      });

      await expect(scanner.probe(500)).resolves.toEqual({
        status: 'ok',
        engine: 'clamav-instream-v1',
      });
    } finally {
      await close(runtime.server);
    }
  });

  it('rejects unexpected probe responses fail-closed', async () => {
    const runtime = await listen('NOPE');
    try {
      const scanner = createClamAvFileSafetyScanner({
        host: '127.0.0.1',
        port: runtime.port,
        timeoutMs: 2_000,
      });

      await expect(scanner.probe(500)).rejects.toThrow(
        'ClamAV health probe returned an invalid response',
      );
    } finally {
      await close(runtime.server);
    }
  });
});
