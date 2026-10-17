/**
 * Conservative client-side interpretation of an idempotent save PUT.
 * A network failure or 5xx does not prove the server skipped the write.
 */
export function searchSaveFailure(status) {
  if (status === null || status === 0 || status >= 500) {
    return { kind: "uncertain" };
  }
  if (status === 401) {
    return {
      kind: "error",
      message: "La sesión venció. Iniciá sesión nuevamente para guardar.",
    };
  }
  if (status === 403 || status === 404) {
    return {
      kind: "error",
      message: "Este apunte ya no está disponible para guardar.",
    };
  }
  return {
    kind: "error",
    message: "No pudimos guardar este apunte. Revisá el acceso e intentá otra vez.",
  };
}
