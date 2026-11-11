// Search is anonymous-readable; a saved-resource acknowledgement is only
// displayed after the authenticated Resources endpoint confirms success.
export function isSaveConfirmed(response) {
  return (
    typeof response === "object" && response !== null && response.saved === true
  );
}

export function saveFailureMessage(error) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : null;
  if ([401, 403, 404, 410].includes(status)) {
    return "Ya no podés guardar este apunte con tu sesión o permisos actuales. Actualizá la búsqueda.";
  }
  if (typeof status === "number" && !saveOutcomeIsUncertain(error)) {
    return "No pudimos guardar este apunte. Revisá los datos y volvé a intentar.";
  }
  return "No pudimos confirmar si quedó guardado. Revisá Guardados antes de volver a intentar.";
}

/**
 * A definitive HTTP 4xx rejection did not commit the save. Timeouts,
 * throttling, transport errors, 5xx and malformed acknowledgements do not
 * prove whether the idempotent PUT reached the server.
 */
export function saveOutcomeIsUncertain(error) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : null;
  return (
    typeof status !== "number" ||
    status < 400 ||
    status >= 500 ||
    status === 408 ||
    status === 429
  );
}
