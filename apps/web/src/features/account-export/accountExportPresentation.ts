import type { AccountExportStatus } from "./accountExportContract";

const MAX_SAFE_TIMEOUT_MS = 2_147_483_647;

/**
 * Remaining time until server-specified export expiration.
 * Never schedules negative, overflowing, or invalid browser timeouts.
 */
export function accountExportExpiryDelayMs(
  expiresAt: string,
  now: number,
): number {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(now)) return 0;
  return Math.min(Math.max(0, expiresAtMs - now), MAX_SAFE_TIMEOUT_MS);
}

/** A local presentation check; downloading is always reauthorized on the API. */
export function isAccountExportDownloadAvailable(
  value: AccountExportStatus | null,
  now: number,
): boolean {
  return (
    value?.state === "completed" &&
    value.downloadable === true &&
    value.downloadExpiresAt !== null &&
    Number.isFinite(now) &&
    Date.parse(value.downloadExpiresAt) > now
  );
}

export function accountExportStatusMessage(
  value: AccountExportStatus,
  now: number,
): string {
  switch (value.state) {
    case "pending":
      return "Tu solicitud está en espera. La preparación se hace de forma segura.";
    case "processing":
      return "Estamos preparando el archivo con tus datos.";
    case "failed":
      return "No pudimos preparar este archivo. Podés solicitar otro.";
    case "completed":
      return isAccountExportDownloadAvailable(value, now)
        ? "El archivo está disponible para descargar."
        : "Este archivo ya no está disponible. Podés solicitar otro.";
  }
}
