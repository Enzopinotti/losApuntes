import { createDeterministicFileSafetyScanner } from './deterministic-file-safety-scanner';

async function* chunks(values: string[]) {
  await Promise.resolve();
  for (const value of values) {
    yield new Uint8Array(Buffer.from(value, 'ascii'));
  }
}

describe('DeterministicFileSafetyScanner', () => {
  it('reports healthy without external dependencies', async () => {
    await expect(
      createDeterministicFileSafetyScanner().probe(),
    ).resolves.toEqual({
      status: 'ok',
      engine: 'deterministic-quarantine-v1',
    });
  });

  it('detects the inert quarantine marker across chunk boundaries', async () => {
    const marker = 'LOSAPUNTES-QUARANTINE-TEST-MARKER-V1';
    const values = ['%PDF-1.7\n', marker.slice(0, 12), marker.slice(12)];
    const byteSize = values.reduce(
      (total, value) => total + Buffer.byteLength(value),
      0,
    );

    await expect(
      createDeterministicFileSafetyScanner().scan({
        chunks: chunks(values),
        byteSize,
        mimeType: 'application/pdf',
      }),
    ).resolves.toEqual({
      verdict: 'malicious',
      engine: 'deterministic-quarantine-v1',
    });
  });

  it('returns clean only after consuming the verified byte count', async () => {
    const value = '%PDF-1.7\nclean';
    await expect(
      createDeterministicFileSafetyScanner().scan({
        chunks: chunks([value]),
        byteSize: Buffer.byteLength(value),
        mimeType: 'application/pdf',
      }),
    ).resolves.toEqual({
      verdict: 'clean',
      engine: 'deterministic-quarantine-v1',
    });

    await expect(
      createDeterministicFileSafetyScanner().scan({
        chunks: chunks([value]),
        byteSize: Buffer.byteLength(value) + 1,
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow('Scanner stream did not match verified byte size');
  });
});
