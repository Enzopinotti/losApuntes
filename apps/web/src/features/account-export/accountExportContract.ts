export class AccountExportContractError extends Error {
  constructor() {
    super("El servidor devolvió un estado de exportación inválido.");
    this.name = "AccountExportContractError";
  }
}

export type AccountExportStatus = {
  id: string;
  format: "los-apuntes-account-export";
  formatVersion: 1;
  state: "pending" | "processing" | "completed" | "failed";
  requestedAt: string;
  failureCode:
    | "ACCOUNT_EXPORT_ACCOUNT_INACTIVE"
    | "EXPORT_ASSEMBLY_RETRY"
    | "EXPORT_RETRY_EXHAUSTED"
    | null;
  downloadExpiresAt: string | null;
  downloadable: boolean;
};

export type AccountExportRequestResult = {
  created: boolean;
  export: AccountExportStatus;
};

export const exportIdPattern =
  /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/iu;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function invalidResponse(): never {
  throw new AccountExportContractError();
}

export function parseAccountExportStatus(value: unknown): AccountExportStatus {
  const data = record(value);
  if (!data) return invalidResponse();

  const { id, format, formatVersion, state, requestedAt, failureCode,
    downloadExpiresAt, downloadable } = data;

  if (
    typeof id !== "string" ||
    !exportIdPattern.test(id) ||
    format !== "los-apuntes-account-export" ||
    formatVersion !== 1 ||
    (state !== "pending" &&
      state !== "processing" &&
      state !== "completed" &&
      state !== "failed") ||
    !isoTimestamp(requestedAt) ||
    (failureCode !== null &&
      failureCode !== "ACCOUNT_EXPORT_ACCOUNT_INACTIVE" &&
      failureCode !== "EXPORT_ASSEMBLY_RETRY" &&
      failureCode !== "EXPORT_RETRY_EXHAUSTED") ||
    (downloadExpiresAt !== null && !isoTimestamp(downloadExpiresAt)) ||
    typeof downloadable !== "boolean" ||
    (downloadable && (state !== "completed" || downloadExpiresAt === null))
  ) {
    return invalidResponse();
  }

  return {
    id,
    format,
    formatVersion,
    state,
    requestedAt,
    failureCode,
    downloadExpiresAt,
    downloadable,
  } as AccountExportStatus;
}

export function parseAccountExportRequest(
  value: unknown,
): AccountExportRequestResult {
  const data = record(value);
  if (!data || typeof data.created !== "boolean") return invalidResponse();
  return {
    created: data.created,
    export: parseAccountExportStatus(data.export),
  };
}

function exportPath(id: string): string {
  if (!exportIdPattern.test(id)) {
    throw new AuthApiError("INVALID_EXPORT_ID", 400, "Exportación inválida.");
  }
  return `/account/exports/${encodeURIComponent(id)}`;
}

