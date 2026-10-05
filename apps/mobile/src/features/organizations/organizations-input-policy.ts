export type OrganizationQueryResult =
  | { ok: true; query: string }
  | { ok: false; message: string };

export function normalizeOrganizationQuery(
  value: string,
): OrganizationQueryResult {
  const query = value.normalize("NFC").trim();

  if (query.length === 0) return { ok: true, query: "" };
  if (query.length < 2) {
    return {
      ok: false,
      message: "Escribí al menos 2 caracteres para buscar por nombre.",
    };
  }
  if (query.length > 120) {
    return {
      ok: false,
      message: "La búsqueda no puede superar los 120 caracteres.",
    };
  }

  return { ok: true, query };
}
