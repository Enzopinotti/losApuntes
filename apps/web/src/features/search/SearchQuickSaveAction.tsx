import { useState } from "react";
import { Link } from "react-router-dom";

import {
  isResourcesApiError,
  resourcesApi,
} from "../resources/services/resourcesService";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";

type SaveState =
  | { scopeKey: string; kind: "saving" }
  | { scopeKey: string; kind: "saved" }
  | { scopeKey: string; kind: "uncertain" }
  | { scopeKey: string; kind: "error"; message: string };

function outcomeFor(error: unknown): {
  kind: "uncertain" | "error";
  message?: string;
} {
  if (
    !isResourcesApiError(error) ||
    error.status === 0 ||
    error.status >= 500
  ) {
    // The server may have committed the PUT before the connection failed.
    // Never claim success or silently repeat an ambiguous write.
    return { kind: "uncertain" };
  }

  if (error.status === 401) {
    return {
      kind: "error",
      message: "La sesión venció. Iniciá sesión nuevamente para guardar.",
    };
  }
  if (error.status === 403 || error.status === 404) {
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

/**
 * Explicit owner action against the existing idempotent resource save API.
 * UI state is scoped to account/session plus resource: it must not be reused
 * after an authority change, a new hit, or component unmount.
 */
export function SearchQuickSaveAction({
  resourceId,
  resourceTitle,
  authorityScope,
}: {
  resourceId: string;
  resourceTitle: string;
  authorityScope: string;
}) {
  const scopeKey = `search-save:${authorityScope}:${resourceId}`;
  const { begin, isCurrent, finish } = useAsyncAuthorityFence(scopeKey);
  const [state, setState] = useState<SaveState | null>(null);
  const current = state?.scopeKey === scopeKey ? state : null;

  const save = async () => {
    if (current?.kind === "saving" || current?.kind === "saved" ||
        current?.kind === "uncertain") return;

    const ticket = begin();
    setState({ scopeKey, kind: "saving" });
    try {
      const result = await resourcesApi.save(resourceId, ticket.signal);
      if (isCurrent(ticket)) {
        if (result.saved === true) {
          setState({ scopeKey, kind: "saved" });
        } else {
          setState({ scopeKey, kind: "uncertain" });
        }
      }
    } catch (error) {
      if (isCurrent(ticket)) {
        const outcome = outcomeFor(error);
        setState({ scopeKey, ...outcome });
      }
    } finally {
      finish(ticket);
    }
  };

  return (
    <div className="search-save-action">
      {current?.kind === "saved" ? (
        <>
          <span role="status">Guardado en tu biblioteca.</span>
          <Link to="/resources?view=saved">Ver mis guardados</Link>
        </>
      ) : current?.kind === "uncertain" ? (
        <>
          <span role="alert">
            No pudimos confirmar el guardado. Revisá tu biblioteca antes de
            repetir la acción.
          </span>
          <Link to="/resources?view=saved">Revisar guardados</Link>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void save()}
            disabled={current?.kind === "saving"}
            aria-label={`Guardar ${resourceTitle} para estudiar después`}
          >
            {current?.kind === "saving"
              ? "Guardando…"
              : current?.kind === "error"
                ? "Reintentar guardar"
                : "Guardar apunte"}
          </button>
          {current?.kind === "error" && (
            <span role="alert">{current.message}</span>
          )}
        </>
      )}
    </div>
  );
}
