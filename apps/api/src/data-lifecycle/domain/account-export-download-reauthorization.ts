import type { AccountExportDownload } from './account-export.service';

/**
 * B92: an owner-authorized private download may spend considerable time
 * preflighting a full S3 object (B91). The owner, expiry or artifact can
 * change during that GET. Recheck against the durable account export
 * record before emitting HTTP headers and compare the exact snapshot.
 *
 * The caller handles the original status codes (404/409/410) and maps
 * 'changed' to a stable conflict, without leaking object generations.
 */
export type AccountExportDownloadReauthorization =
  'unchanged' | 'not_found' | 'not_ready' | 'expired' | 'changed';

export function reauthorizeAccountExportDownload(
  before: AccountExportDownload,
  after: AccountExportDownload,
): AccountExportDownloadReauthorization {
  if (after.kind !== 'available') return after.kind;
  if (before.kind !== 'available') return 'changed';
  if (
    before.generation !== after.generation ||
    before.formatVersion !== after.formatVersion ||
    before.byteLength !== after.byteLength ||
    before.sha256 !== after.sha256
  )
    return 'changed';
  return 'unchanged';
}
