import { useRef, useState } from "react";
import { resourcesApi } from "../resources/services/resourcesService";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";
import {
  isSaveConfirmed,
  saveFailureMessage,
} from "./search-save-feedback.mjs";
import { unsaveFailureMessage } from "./search-unsave-feedback.mjs";

type SavePhase =
  "saving" | "saved" | "removing" | "removed" | "save-failed" | "remove-failed";

type SaveState = {
  scopeKey: string;
  phase: SavePhase;
  message: string | null;
};

type SearchSaveActionProps = {
  resourceId: string;
  resourceTitle: string;
  authorityScope: string;
};

export function SearchSaveAction({
  resourceId,
  resourceTitle,
  authorityScope,
}: SearchSaveActionProps) {
  const scopeKey = `search-save:${authorityScope}:${resourceId}`;
  const { begin, isCurrent, finish } = useAsyncAuthorityFence(scopeKey);
  const pendingRef = useRef(false);
  const [state, setState] = useState<SaveState | null>(null);
  const current = state?.scopeKey === scopeKey ? state : null;
  const saving = current?.phase === "saving";
  const removing = current?.phase === "removing";
  const busy = saving || removing;
  const saved = current?.phase === "saved";
  // A lost DELETE acknowledgement is inconclusive: allow a safe retry,
  // but never claim the item is definitely saved or definitely removed.
  const retryRemove = current?.phase === "remove-failed";
  const shouldRemove = saved || retryRemove;

  const toggleSaved = async () => {
    if (pendingRef.current) return;
    const ticket = begin();
    if (!isCurrent(ticket)) return;
    pendingRef.current = true;
    const action = shouldRemove ? "remove" : "save";
    setState({
      scopeKey,
      phase: action === "remove" ? "removing" : "saving",
      message: null,
    });

    try {
      if (action === "remove") {
        // The server owns the authoritative saved state. An acknowledged
        // DELETE (including idempotent retry) is the only successful removal.
        await resourcesApi.unsave(resourceId, ticket.signal);
        if (!isCurrent(ticket)) return;
        setState({
          scopeKey,
          phase: "removed",
          message: "Quitado de guardados. Podés volver a guardarlo.",
        });
      } else {
        const response = await resourcesApi.save(resourceId, ticket.signal);
        if (!isCurrent(ticket)) return;
        if (!isSaveConfirmed(response)) {
          throw new Error("Resource save response was not confirmed");
        }
        setState({
          scopeKey,
          phase: "saved",
          message: "Guardado en tu biblioteca.",
        });
      }
    } catch (error) {
      if (!isCurrent(ticket)) return;
      setState({
        scopeKey,
        phase: action === "remove" ? "remove-failed" : "save-failed",
        message:
          action === "remove"
            ? unsaveFailureMessage(error)
            : saveFailureMessage(error),
      });
    } finally {
      pendingRef.current = false;
      finish(ticket);
    }
  };

  const actionLabel = saving
    ? "Guardando…"
    : removing
      ? "Quitando…"
      : retryRemove
        ? "Reintentar quitar"
        : saved
          ? "Quitar de guardados"
          : "Guardar apunte";
  const accessibleLabel = saving
    ? `Guardando apunte: ${resourceTitle}`
    : removing
      ? `Quitando apunte: ${resourceTitle}`
      : retryRemove
        ? `Reintentar quitar apunte: ${resourceTitle}`
        : saved
          ? `Quitar de guardados: ${resourceTitle}`
          : `Guardar apunte: ${resourceTitle}`;

  return (
    <div className="search-save-action">
      <button
        type="button"
        aria-label={accessibleLabel}
        disabled={busy}
        onClick={() => void toggleSaved()}
      >
        {actionLabel}
      </button>
      {current?.message && (
        <p
          role={
            current.phase === "save-failed" || current.phase === "remove-failed"
              ? "alert"
              : "status"
          }
        >
          {current.message}
        </p>
      )}
    </div>
  );
}
