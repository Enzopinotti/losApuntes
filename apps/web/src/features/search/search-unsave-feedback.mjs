// A DELETE may commit even when the browser loses its acknowledgement.
// Never announce "still saved" or "successfully removed" after an error.
export function unsaveFailureMessage(error) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : null;
  if ([401, 403, 404, 410].includes(status)) {
    return "Ya no podés modificar este guardado con tu sesión o permisos actuales. Actualizá la búsqueda.";
  }
  return "No pudimos confirmar si se quitó el apunte. Revisá Guardados antes de reintentar.";
}
