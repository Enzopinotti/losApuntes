import {
  AuthApiError,
  authenticatedApiUrl,
  authenticatedJsonRequest,
} from "../auth/services/authService";
import {
  exportIdPattern,
  parseAccountExportRequest,
  parseAccountExportStatus,
  type AccountExportRequestResult,
  type AccountExportStatus,
} from "./accountExportContract";

export type { AccountExportRequestResult, AccountExportStatus } from "./accountExportContract";

function exportPath(id: string): string {
  if (!exportIdPattern.test(id)) {
    throw new AuthApiError("INVALID_EXPORT_ID", 400, "Exportación inválida.");
  }
  return `/account/exports/${encodeURIComponent(id)}`;
}

export const accountExportApi = {
  request: async (signal?: AbortSignal): Promise<AccountExportRequestResult> =>
    parseAccountExportRequest(
      await authenticatedJsonRequest<unknown>("/account/exports", {
        method: "POST",
        signal,
      }),
    ),

  status: async (
    id: string,
    signal?: AbortSignal,
  ): Promise<AccountExportStatus> =>
    parseAccountExportStatus(
      await authenticatedJsonRequest<unknown>(exportPath(id), { signal }),
    ),

  // Native browser attachment navigation avoids buffering private export
  // bytes in a Blob, service worker cache or JavaScript heap. The API
  // reauthorizes this GET on every request; the URL contains no authority.
  downloadUrl: (id: string): string =>
    authenticatedApiUrl(`${exportPath(id)}/download`),
};
