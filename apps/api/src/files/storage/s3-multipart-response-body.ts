/**
 * Read only the bounded HTTP response body of S3 CompleteMultipartUpload.
 *
 * An S3-compatible server or proxy can send HTTP 200 and an arbitrarily
 * large body. Calling response.text() first defeats B96's 64 KiB XML
 * validation limit, since the full body has already been buffered.
 *
 * This function consumes the actual network stream incrementally, stops
 * before retaining an over-limit chunk, and cancels the reader on every
 * error. It is not a generic XML parser; B96 validates the decoded XML.
 */
export const MAX_S3_MULTIPART_COMPLETION_BYTES = 64 * 1024;

export async function readBoundedS3MultipartCompletionXml(
  response: Pick<Response, 'body'>,
  purpose: 'completion' | 'initiation' = 'completion',
): Promise<string> {
  if (!response.body) {
    throw new Error(`S3 multipart ${purpose} response body is missing`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let xml = '';
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        xml += decoder.decode();
        return xml;
      }
      if (!(value instanceof Uint8Array)) {
        throw new Error(
          `S3 multipart ${purpose} response returned invalid bytes`,
        );
      }
      // Fail before retaining/decoding unbounded data, even if a provider
      // incorrectly omits Content-Length or responds with chunked HTTP.
      if (value.byteLength > MAX_S3_MULTIPART_COMPLETION_BYTES - size) {
        throw new Error(`S3 multipart ${purpose} response exceeds 65536 bytes`);
      }
      size += value.byteLength;
      xml += decoder.decode(value, { stream: true });
    }
  } finally {
    if (!finished) {
      // Cancellation is best effort; never let provider cancellation mask
      // the underlying size, decoding or transport error.
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

/** Reuse B97's streamed, UTF-8-fatal, 64-KiB budget for multipart initiation. */
export function readBoundedS3MultipartInitiationXml(
  response: Pick<Response, 'body'>,
): Promise<string> {
  return readBoundedS3MultipartCompletionXml(response, 'initiation');
}
