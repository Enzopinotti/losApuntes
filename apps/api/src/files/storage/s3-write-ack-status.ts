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
