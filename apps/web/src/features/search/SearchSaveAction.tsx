import { useRef, useState } from "react";
import { resourcesApi } from "../resources/services/resourcesService";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";
import {
  isSaveConfirmed,
  saveFailureMessage,
} from "./search-save-feedback.mjs";

type SaveState = {
  scopeKey: string;
  phase: "saving" | "saved" | "failed";
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
  const saved = current?.phase === "saved";

  const save = async () => {
    if (pendingRef.current || saved) return;
    pendingRef.current = true;
    const ticket = begin();
    if (!isCurrent(ticket)) {
      pendingRef.current = false;
      return;
    }

    setState({ scopeKey, phase: "saving", message: null });
    try {
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
    } catch (error) {
      if (!isCurrent(ticket)) return;
      setState({
        scopeKey,
        phase: "failed",
        message: saveFailureMessage(error),
      });
    } finally {
      pendingRef.current = false;
      finish(ticket);
    }
  };

  return (
    <div className="search-save-action">
      <button
        type="button"
        aria-label={
          saving
            ? `Guardando apunte: ${resourceTitle}`
            : saved
              ? `Apunte guardado: ${resourceTitle}`
              : `Guardar apunte: ${resourceTitle}`
        }
        disabled={saving || saved}
        onClick={() => void save()}
      >
        {saving ? "Guardando…" : saved ? "Guardado" : "Guardar apunte"}
      </button>
      {current?.message && (
        <p role={current.phase === "failed" ? "alert" : "status"}>
          {current.message}
        </p>
      )}
    </div>
  );
}
