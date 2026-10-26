import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/useAuth";
import { isAuthApiError } from "../auth/services/authService";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";
import {
  accountExportApi,
  type AccountExportStatus,
} from "./accountExportService";
import {
  accountExportExpiryDelayMs,
  accountExportStatusMessage,
  isAccountExportDownloadAvailable,
} from "./accountExportPresentation";

const RECONCILE_INTERVAL_MS = 30_000;

type Scoped<T> = { scopeKey: string; value: T };
type ExportPresentation = {
  export: AccountExportStatus | null;
  busy: boolean;
  refreshing: boolean;
  message: string | null;
  error: string | null;
};

const initial: ExportPresentation = {
  export: null,
  busy: false,
  refreshing: false,
  message: null,
  error: null,
};

function errorMessage(error: unknown): string {
  if (isAuthApiError(error)) {
    if (error.code === "ACCOUNT_EXPORT_ACCOUNT_INACTIVE") {
      return "La cuenta debe estar activa para exportar los datos.";
    }
    if (error.code === "AUTHENTICATION_REQUIRED" || error.status === 401) {
      return "Tu sesión venció. Iniciá sesión nuevamente.";
    }
    if (error.code === "NETWORK_UNAVAILABLE") {
      return "No pudimos conectarnos. Volvé a intentar.";
    }
    if (error.code === "INVALID_RESPONSE") {
      return "No pudimos verificar el estado de la exportación.";
    }
  }
  return "No pudimos completar la operación de exportación.";
}

export function AccountExportPanel() {
  const { status, user, session } = useAuth();
  const scopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");

  const [scoped, setScoped] = useState<Scoped<ExportPresentation> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const current = scoped?.scopeKey === scopeKey ? scoped.value : initial;
  const { export: job, busy, refreshing, message, error } = current;

  const update = useCallback(
    (change: (current: ExportPresentation) => ExportPresentation) => {
      setScoped((previous) => ({
        scopeKey,
        value: change(
          previous?.scopeKey === scopeKey ? previous.value : initial,
        ),
      }));
    },
    [scopeKey],
  );

  const {
    begin: beginAction,
    isCurrent: actionIsCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(`account-export-action:${scopeKey}`);
  const {
    begin: beginStatus,
    isCurrent: statusIsCurrent,
    finish: finishStatus,
  } = useAsyncAuthorityFence(`account-export-status:${scopeKey}`);

  const requestExport = async () => {
    if (status !== "authenticated" || busy) return;
    const ticket = beginAction();
    if (!actionIsCurrent(ticket)) return;

    update((previous) => ({
      ...previous,
      busy: true,
      error: null,
      message: null,
    }));
    try {
      const result = await accountExportApi.request(ticket.signal);
      if (!actionIsCurrent(ticket)) return;
      update((previous) => ({
        ...previous,
        export: result.export,
        message: result.created
          ? "Recibimos tu solicitud."
          : "Retomamos tu solicitud existente.",
        error: null,
      }));
    } catch (cause) {
      if (actionIsCurrent(ticket)) {
        update((previous) => ({
          ...previous,
          error: errorMessage(cause),
        }));
      }
    } finally {
      if (finishAction(ticket)) {
        update((previous) => ({ ...previous, busy: false }));
      }
    }
  };

  const refreshStatus = useCallback(async () => {
    if (status !== "authenticated" || !job?.id) return;
    const ticket = beginStatus();
    if (!statusIsCurrent(ticket)) return;
    update((previous) => ({ ...previous, refreshing: true }));
    try {
      const fresh = await accountExportApi.status(job.id, ticket.signal);
      if (!statusIsCurrent(ticket)) return;
      update((previous) => ({
        ...previous,
        export: fresh,
        refreshing: false,
        error: null,
      }));
    } catch (cause) {
      if (statusIsCurrent(ticket)) {
        update((previous) => ({
          ...previous,
          error: errorMessage(cause),
        }));
      }
    } finally {
      if (finishStatus(ticket)) {
        update((previous) => ({ ...previous, refreshing: false }));
      }
    }
  }, [beginStatus, finishStatus, job?.id, status, statusIsCurrent, update]);

  // An issued download can expire while Security stays open, even without a
  // new API response. The same clock drives the link and its status message.
  useEffect(() => {
    const expiresAt = job?.downloadExpiresAt;
    if (
      status !== "authenticated" ||
      job?.state !== "completed" ||
      !job.downloadable ||
      !expiresAt
    ) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const clearExpiryTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const reconcileExpiry = () => {
      clearExpiryTimer();
      const currentTime = Date.now();
      setNow(currentTime);
      if (document.visibilityState !== "visible") return;
      const delayMs = accountExportExpiryDelayMs(expiresAt, currentTime);
      if (delayMs > 0) timer = window.setTimeout(reconcileExpiry, delayMs);
    };
    reconcileExpiry();
    window.addEventListener("focus", reconcileExpiry);
    document.addEventListener("visibilitychange", reconcileExpiry);
    return () => {
      clearExpiryTimer();
      window.removeEventListener("focus", reconcileExpiry);
      document.removeEventListener("visibilitychange", reconcileExpiry);
    };
  }, [job?.id, job?.state, job?.downloadable, job?.downloadExpiresAt, status]);

  const active = job?.state === "pending" || job?.state === "processing";
  useEffect(() => {
    if (status !== "authenticated" || !active || busy) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (intervalId !== null) clearInterval(intervalId);
      intervalId = null;
    };
    const reconcile = () => {
      if (document.visibilityState === "visible") void refreshStatus();
    };
    const start = () => {
      if (document.visibilityState !== "visible" || intervalId !== null) {
        return;
      }
      intervalId = setInterval(reconcile, RECONCILE_INTERVAL_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        stop();
      } else {
        reconcile();
        start();
      }
    };

    start();
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, busy, refreshStatus, status]);

  const available = isAccountExportDownloadAvailable(job, now);
  const mayRequest =
    !job || job.state === "failed" || (job.state === "completed" && !available);

  if (status !== "authenticated") return null;

  return (
    <section aria-labelledby="account-export-title">
      <h2 id="account-export-title">Exportar mis datos</h2>
      <p>
        Podés solicitar una copia de tu información. La preparación es asíncrona
        y el archivo puede contener datos personales y tus aportes. Guardalo en
        un lugar privado.
      </p>
      <p>
        La descarga requiere una sesión activa y se autoriza nuevamente al
        solicitarla. No compartimos enlaces permanentes al archivo.
      </p>

      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}

      {job && (
        <div aria-live="polite" aria-atomic="true">
          <p>{accountExportStatusMessage(job, now)}</p>
          <p>Solicitado: {new Date(job.requestedAt).toLocaleString("es-AR")}</p>
          {job.downloadExpiresAt && (
            <p>
              Fecha límite de descarga:{" "}
              {new Date(job.downloadExpiresAt).toLocaleString("es-AR")}
            </p>
          )}
          {job.state === "failed" && (
            <p>
              La solicitud terminó sin generar una copia. No se muestra
              información interna del procesamiento.
            </p>
          )}
        </div>
      )}

      {mayRequest && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void requestExport()}
        >
          {busy
            ? "Solicitando…"
            : job
              ? "Solicitar otra copia"
              : "Solicitar mis datos"}
        </button>
      )}

      {job && (
        <button
          type="button"
          disabled={busy || refreshing}
          onClick={() => void refreshStatus()}
        >
          {refreshing ? "Actualizando…" : "Consultar estado"}
        </button>
      )}

      {available && job && (
        <p>
          <a
            href={accountExportApi.downloadUrl(job.id)}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Descargar archivo JSON
          </a>
        </p>
      )}
    </section>
  );
}
