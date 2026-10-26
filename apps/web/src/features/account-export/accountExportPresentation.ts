import type { AccountExportStatus } from "./accountExportContract";

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function accountExportExpiryDelayMs(
  expiresAt: string,
  now = Date.now(),
): number {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return 0;
  return Math.min(Math.max(0, expiresAtMs - now), MAX_TIMER_DELAY_MS);
}

export function isAccountExportDownloadAvailable(
  value: AccountExportStatus | null,
  now = Date.now(),
): boolean {
  return (
    value?.state === "completed" &&
    value.downloadable &&
    value.downloadExpiresAt !== null &&
    Date.parse(value.downloadExpiresAt) > now
  );
}

export function accountExportStatusMessage(
  value: AccountExportStatus,
  now = Date.now(),
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
