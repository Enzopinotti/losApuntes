/**
 * S3 write acceptance is operation-specific; fetch(Response).ok accepts any
 * 2xx, including 202 Accepted and 206 Partial Content, neither of which
 * confirms a completed PutObject / UploadPart / multipart POST.
 *
 * AWS S3 successful write operations return HTTP 200. AbortMultipartUpload
 * is separately idempotent (204, some compatible providers 200, or 404).
 */
export function isConfirmedS3WriteAcknowledgement(status: number): boolean {
  return status === 200;
}

export function isConfirmedS3MultipartAbort(status: number): boolean {
  return status === 204 || status === 200 || status === 404;
}

/**
 * B120: DeleteObject must have an acknowledged, terminal result.
 * AWS S3 returns 204 No Content, compatible providers sometimes 200 OK,
 * and an absent key is an idempotent 404. 202 is asynchronous acceptance
 * and 206 is partial: neither proves private bytes have been retired.
 */
export function isConfirmedS3ObjectDelete(status: number): boolean {
  return status === 204 || status === 200 || status === 404;
}
