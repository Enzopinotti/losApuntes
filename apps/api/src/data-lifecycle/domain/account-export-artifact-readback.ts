import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * B90: A successful S3 PUT/Complete ACK is not proof that the persisted
 * private export bytes match the JSON already checked by the assembler.
 * Verify the stored exact-generation object before Mongo can publish it.
 *
 * Reads are streaming and bounded by the expected size (never buffer the
 * whole object). Any storage or integrity uncertainty rejects publication;
 * B80's durable orphan intent + B81's no-direct-delete abort clean it later.
 */
export async function verifyAccountExportStoredBytes(
  chunks: AsyncIterable<Uint8Array>,
  expected: { byteLength: number; sha256: string },
): Promise<void> {
  if (
    !Number.isSafeInteger(expected.byteLength) ||
    expected.byteLength < 1 ||
    typeof expected.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(expected.sha256)
  ) {
    throw new Error('Account export S3 readback expected metadata is invalid');
  }

  const digest = createHash('sha256');
  let bytesRead = 0;
  for await (const chunk of chunks) {
    if (!(chunk instanceof Uint8Array)) {
      throw new Error('Account export S3 readback returned invalid bytes');
    }
    // Do not permit a corrupt or malicious provider response to consume
    // unbounded CPU or memory beyond the already known export byte length.
    if (chunk.byteLength > expected.byteLength - bytesRead) {
      throw new Error(
        'Account export S3 readback exceeds expected byte length',
      );
    }
    bytesRead += chunk.byteLength;
    digest.update(chunk);
  }

  if (bytesRead !== expected.byteLength) {
    throw new Error('Account export S3 readback byte length mismatch');
  }
  const storedHash = digest.digest();
  const expectedHash = Buffer.from(expected.sha256, 'hex');
  if (!timingSafeEqual(storedHash, expectedHash)) {
    throw new Error('Account export S3 readback SHA-256 mismatch');
  }
}
