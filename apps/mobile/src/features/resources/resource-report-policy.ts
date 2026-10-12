export const RESOURCE_REPORT_REASONS = [
  { value: "spam", label: "Spam o publicidad" },
  { value: "plagiarism", label: "Plagio" },
  { value: "copyright", label: "Derechos de autor" },
  { value: "honor_code", label: "Integridad académica" },
  { value: "inappropriate", label: "Contenido inapropiado" },
  { value: "other", label: "Otro motivo" },
] as const;

export type ResourceReportReason =
  (typeof RESOURCE_REPORT_REASONS)[number]["value"];

export type ResourceReportInput = {
  reason: ResourceReportReason;
  details?: string;
};

export type ResourceReportValidation =
  | { kind: "valid"; input: ResourceReportInput }
  | { kind: "invalid"; message: string };

export const RESOURCE_REPORT_DETAILS_MAX_LENGTH = 1500;

/** Mirrors the current POST /resources/:id/reports validation contract. */
export function validateResourceReport(
  reason: ResourceReportReason | null,
  details: string,
): ResourceReportValidation {
  if (
    !reason ||
    !RESOURCE_REPORT_REASONS.some((item) => item.value === reason)
  ) {
    return { kind: "invalid", message: "Elegí el motivo del reporte." };
  }

  const normalized = details.normalize("NFC").trim();
  if (normalized.length > RESOURCE_REPORT_DETAILS_MAX_LENGTH) {
    return {
      kind: "invalid",
      message: "Los detalles pueden tener hasta 1500 caracteres.",
    };
  }
  if (normalized.length > 0 && normalized.length < 3) {
    return {
      kind: "invalid",
      message: "Escribí al menos 3 caracteres o dejá los detalles vacíos.",
    };
  }

  return {
    kind: "valid",
    input: {
      reason,
      ...(normalized ? { details: normalized } : {}),
    },
  };
}
