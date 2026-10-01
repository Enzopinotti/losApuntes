import { createDeterministicFileSafetyScanner } from './deterministic-file-safety-scanner';

async function* chunks(values: string[]) {
  for (const value of values) {
    yield new Uint8Array(Buffer.from(value, 'ascii'));
  }
}

describe('DeterministicFileSafetyScanner', () => {
  it('detects the EICAR marker across stream chunk boundaries', async () => {
    const marker =
      'X5O!P%@AP[4\\\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const values = ['%PDF-1.7\n', marker.slice(0, 20), marker.slice(20)];
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
      engine: 'deterministic-eicar-v1',
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
      engine: 'deterministic-eicar-v1',
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
