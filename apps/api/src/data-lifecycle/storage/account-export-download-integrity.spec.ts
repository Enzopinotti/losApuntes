import { createHash } from 'node:crypto';

import { verifyAccountExportDownload } from './account-export-download-integrity';

const content = Buffer.from('{"format":"los-apuntes-account-export"}', 'utf8');
const expectedSha256 = createHash('sha256').update(content).digest('hex');

function chunks(parts: readonly Uint8Array[]) {
  return (async function* () {
    for (const part of parts) yield part;
  })();
}

async function consume(iterable: AsyncIterable<Uint8Array>) {
  const received: Uint8Array[] = [];
  for await (const bytes of iterable) received.push(bytes);
  return Buffer.concat(received);
}

describe('verifyAccountExportDownload', () => {
  it('passes unchanged chunks and verifies exact committed digest', async () => {
    const result = await consume(
      verifyAccountExportDownload(
        chunks([content.subarray(0, 12), content.subarray(12)]),
        content.byteLength,
        expectedSha256,
      ),
    );
    expect(result).toEqual(content);
  });

  it('rejects a truncated provider read at end-of-file', async () => {
    await expect(
      consume(
        verifyAccountExportDownload(
          chunks([content.subarray(0, content.byteLength - 1)]),
          content.byteLength,
          expectedSha256,
        ),
      ),
    ).rejects.toThrow('integrity check failed');
  });

  it('rejects an overlong chunk before delivering bytes beyond the allowed length', async () => {
    const received: Uint8Array[] = [];
    const stream = verifyAccountExportDownload(
      chunks([content.subarray(0, 8), Buffer.concat([content, Buffer.from('x')])]),
      content.byteLength,
      expectedSha256,
    );
    await expect((async () => {
      for await (const part of stream) received.push(part);
    })()).rejects.toThrow('exceeds its committed length');
    expect(Buffer.concat(received)).toEqual(content.subarray(0, 8));
  });

  it('rejects same-length tampering by SHA-256 even with correct content-length', async () => {
    const tampered = Buffer.from(content);
    tampered[3] = tampered[3] === 0x61 ? 0x62 : 0x61;
    await expect(
      consume(verifyAccountExportDownload(
        chunks([tampered]),
        content.byteLength,
        expectedSha256,
      )),
    ).rejects.toThrow('integrity check failed');
  });

  it('fails closed on missing, invalid and unsafe-length metadata', async () => {
    for (const byteLength of [0, -1, Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(consume(
        verifyAccountExportDownload(chunks([content]), byteLength, expectedSha256),
      )).rejects.toThrow('integrity metadata is invalid');
    }
    await expect(consume(
      verifyAccountExportDownload(chunks([content]), content.byteLength, 'invalid'),
    )).rejects.toThrow('integrity metadata is invalid');
  });

  it('rejects non-binary chunks without exposing their values', async () => {
    await expect(consume(
      verifyAccountExportDownload(
        chunks(['private-not-binary' as unknown as Uint8Array]),
        content.byteLength,
        expectedSha256,
      ),
    )).rejects.toThrow('invalid chunk');
  });

  it('rejects an abort in flight and propagates cleanup to the provider iterator', async () => {
    const controller = new AbortController();
    let closed = false;
    async function* provider() {
      try {
        yield content.subarray(0, 5);
        controller.abort();
        yield content.subarray(5);
      } finally {
        closed = true;
      }
    }
    await expect(consume(
      verifyAccountExportDownload(
        provider(), content.byteLength, expectedSha256, controller.signal,
      ),
    )).rejects.toThrow('cancelled');
    expect(closed).toBe(true);
  });

  it('does not leak a provider failure message through integrity handling', async () => {
    const failure = new Error('private internal storage object key');
    async function* failedProvider() {
      await Promise.reject(failure);
      yield content;
    }
    await expect(consume(
      verifyAccountExportDownload(
        failedProvider(), content.byteLength, expectedSha256,
      ),
    )).rejects.toBe(failure);
  });
});
