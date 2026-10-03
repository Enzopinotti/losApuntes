import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type { NotificationView } from "../features/community/interfaces";
import {
  communityApi,
  isCommunityApiError,
} from "../features/community/services/communityService";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./Community.scss";

const NOTIFICATION_RECONCILE_INTERVAL_MS = 30_000;

const labels: Record<NotificationView["type"], string> = {
  "social.followed": "empezó a seguirte",
  "social.connection_requested": "te envió una solicitud de conexión",
  "social.connection_accepted": "aceptó tu solicitud de conexión",
  "qa.question_answered": "respondió tu pregunta",
  "qa.answer_accepted": "aceptó tu respuesta",
};

function targetPath(item: NotificationView): string | null {
  if (item.target.type === "profile") return `/p/${item.target.id}`;
  if (item.target.type === "question") return `/questions?id=${item.target.id}`;
  if (item.target.type === "answer") return "/questions";
  if (item.target.type === "connection") return "/network";
  return null;
}

function messageFor(error: unknown, fallback: string): string {
  return isCommunityApiError(error) ? error.message : fallback;
}

const Notifications = () => {
  const { status, user, session } = useAuth();
  const [items, setItems] = useState<NotificationView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authorityScope = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const {
    begin: beginListRequest,
    isCurrent: isListRequestCurrent,
    finish: finishListRequest,
  } = useAsyncAuthorityFence(
    `notifications:${authorityScope}:${String(unreadOnly)}`,
  );
  const {
    begin: beginActionRequest,
    isCurrent: isActionRequestCurrent,
    finish: finishActionRequest,
  } = useAsyncAuthorityFence(`notifications-action:${authorityScope}`);

  const busy = loadingMore || actionBusy;

  const load = useCallback(
    async (cursor?: string, append = false, silent = false) => {
      const ticket = beginListRequest();

      if (append) {
        setLoadingMore(true);
      } else if (!silent) {
        setLoading(true);
      }
      if (!silent) setError(null);

      try {
        const result = await communityApi.notifications(
          {
            unreadOnly,
            cursor,
            limit: 50,
          },
          ticket.signal,
        );
        if (!isListRequestCurrent(ticket)) return;

        setItems((current) =>
          append ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.nextCursor);
        setError(null);
      } catch (nextError) {
        if (!isListRequestCurrent(ticket) || silent) return;
        setError(
          messageFor(nextError, "No pudimos cargar tus notificaciones."),
        );
      } finally {
        if (!finishListRequest(ticket)) return;
        if (append) {
          setLoadingMore(false);
        } else if (!silent) {
          setLoading(false);
        }
      }
    },
    [
      beginListRequest,
      finishListRequest,
      isListRequestCurrent,
      unreadOnly,
    ],
  );

  useEffect(() => {
    setLoadingMore(false);
    void load();
  }, [load]);

  useEffect(() => {
    if (status !== "authenticated" || busy || loading) return;

    let intervalId: number | null = null;

    const stopPolling = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const reconcile = () => {
      if (document.visibilityState !== "visible") return;
      void load(undefined, false, true);
    };

    const startPolling = () => {
      if (
        document.visibilityState !== "visible" ||
        intervalId !== null
      ) {
        return;
      }
      intervalId = window.setInterval(
        reconcile,
        NOTIFICATION_RECONCILE_INTERVAL_MS,
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconcile();
        startPolling();
      } else {
        stopPolling();
      }
    };

    const onFocus = () => {
      if (document.visibilityState === "visible") reconcile();
    };

    startPolling();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopPolling();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [busy, load, loading, status]);

  const markRead = async (id: string) => {
    const ticket = beginActionRequest();
    setActionBusy(true);
    setError(null);

    try {
      await communityApi.markNotificationRead(id);
      if (!isActionRequestCurrent(ticket)) return;
      await load(undefined, false, true);
    } catch (nextError) {
      if (!isActionRequestCurrent(ticket)) return;
      setError(messageFor(nextError, "No pudimos marcar la notificación."));
    } finally {
      if (finishActionRequest(ticket)) setActionBusy(false);
    }
  };

  const markAll = async () => {
    const ticket = beginActionRequest();
    setActionBusy(true);
    setError(null);

    try {
      await communityApi.markAllNotificationsRead();
      if (!isActionRequestCurrent(ticket)) return;
      await load(undefined, false, true);
    } catch (nextError) {
      if (!isActionRequestCurrent(ticket)) return;
      setError(
        messageFor(nextError, "No pudimos actualizar tus notificaciones."),
      );
    } finally {
      if (finishActionRequest(ticket)) setActionBusy(false);
    }
  };

  return (
    <section className="community-page" aria-labelledby="notifications-title">
      <header className="community-hero">
        <p className="community-eyebrow">Actividad</p>
        <h1 id="notifications-title">Notificaciones</h1>
        <p>
          Estas notificaciones informan cambios; nunca otorgan acceso al objeto
          que referencian.
        </p>
      </header>

      {error && (
        <p className="community-error" role="alert">
          {error}
        </p>
      )}

      <div className="community-toolbar">
        <label>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
          />
          Solo no leídas
        </label>
        <button type="button" disabled={busy} onClick={() => void markAll()}>
          Marcar todas como leídas
        </button>
      </div>

      <section className="community-card">
        {loading ? (
          <p>Cargando…</p>
        ) : items.length === 0 ? (
          <p>No hay notificaciones para mostrar.</p>
        ) : (
          <>
            <ul className="community-list">
              {items.map((item) => {
                const target = targetPath(item);
                return (
                  <li key={item.id} className={item.readAt ? "" : "unread"}>
                    <div>
                      <strong>
                        {item.actor?.displayName ?? "Los Apuntes"}{" "}
                        {labels[item.type]}
                      </strong>
                      <small>{new Date(item.createdAt).toLocaleString()}</small>
                      {target && <Link to={target}>Abrir</Link>}
                    </div>
                    {!item.readAt && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void markRead(item.id)}
                      >
                        Marcar leída
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {nextCursor && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void load(nextCursor, true)}
              >
                {loadingMore ? "Cargando…" : "Cargar más"}
              </button>
            )}
          </>
        )}
      </section>
    </section>
  );
};

export default Notifications;
