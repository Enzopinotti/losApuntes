export const ORGANIZATION_REPORT_REASONS = [
  { value: "spam", label: "Spam o publicidad" },
  { value: "impersonation", label: "Suplantación" },
  { value: "misinformation", label: "Información falsa" },
  { value: "harassment", label: "Acoso" },
  { value: "inappropriate", label: "Contenido inapropiado" },
  { value: "other", label: "Otro motivo" },
] as const;

export type OrganizationReportReason =
  (typeof ORGANIZATION_REPORT_REASONS)[number]["value"];

export type OrganizationReportInput = {
  reason: OrganizationReportReason;
  details?: string;
};

export type OrganizationReportValidation =
  | { kind: "valid"; input: OrganizationReportInput }
  | { kind: "invalid"; message: string };

export const ORGANIZATION_REPORT_DETAILS_MAX_LENGTH = 1500;

export function validateOrganizationReport(
  reason: OrganizationReportReason | null,
  details: string,
): OrganizationReportValidation {
  if (
    !reason ||
    !ORGANIZATION_REPORT_REASONS.some((option) => option.value === reason)
  ) {
    return { kind: "invalid", message: "Elegí el motivo del reporte." };
  }

  const normalized = details.normalize("NFC").trim();
  if (normalized.length > ORGANIZATION_REPORT_DETAILS_MAX_LENGTH) {
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
