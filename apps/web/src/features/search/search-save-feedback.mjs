// Search is anonymous-readable; a saved-resource acknowledgement is only
// displayed after the authenticated Resources endpoint confirms success.
export function isSaveConfirmed(response) {
  return (
    typeof response === "object" &&
    response !== null &&
    response.saved === true
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
  return "No pudimos confirmar si quedó guardado. Revisá Guardados antes de volver a intentar.";
}
