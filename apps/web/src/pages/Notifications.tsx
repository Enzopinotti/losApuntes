import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type { NotificationView } from "../features/community/interfaces";
import { notificationTargetPath } from "../features/community/notification-navigation.mjs";
import {
  communityApi,
  isCommunityApiError,
} from "../features/community/services/communityService";
import { shouldReconcileNotificationTick } from "../features/community/notificationReconciliation";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./Community.scss";

const NOTIFICATION_PAGE_SIZE = 50;
const NOTIFICATION_RECONCILE_INTERVAL_MS = 30_000;

const labels: Record<NotificationView["type"], string> = {
  "social.followed": "empezó a seguirte",
  "social.connection_requested": "te envió una solicitud de conexión",
  "social.connection_accepted": "aceptó tu solicitud de conexión",
  "qa.question_answered": "respondió tu pregunta",
  "qa.answer_accepted": "aceptó tu respuesta",
};

function messageFor(error: unknown, fallback: string): string {
  return isCommunityApiError(error) ? error.message : fallback;
}

const Notifications = () => {
  const { status, user, session } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadedPages, setLoadedPages] = useState(1);
  const [reconcileTick, setReconcileTick] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [openingState, setOpeningState] = useState<{
    scopeKey: string;
    notificationId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstPagePendingRef = useRef(false);
  const consumedReconcileTickRef = useRef(0);

  const authorityScope = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const listScope = `notifications:${authorityScope}:${String(unreadOnly)}`;
  const {
    begin: beginListRequest,
    isCurrent: isListRequestCurrent,
    finish: finishListRequest,
  } = useAsyncAuthorityFence(listScope);
  const {
    begin: beginActionRequest,
    isCurrent: isActionRequestCurrent,
    finish: finishActionRequest,
  } = useAsyncAuthorityFence(`notifications-action:${authorityScope}`);

  const busy = loadingMore || actionBusy;
  const openingNotificationId =
    openingState?.scopeKey === authorityScope
      ? openingState.notificationId
      : null;

  const loadFirstPage = useCallback(async () => {
    const ticket = beginListRequest();
    firstPagePendingRef.current = true;
    setLoading(true);
    setLoadingMore(false);
    setError(null);

    try {
      const result = await communityApi.notifications(
        {
          unreadOnly,
          limit: NOTIFICATION_PAGE_SIZE,
        },
        ticket.signal,
      );
      if (!isListRequestCurrent(ticket)) return;

      setItems(result.items);
      setNextCursor(result.nextCursor);
      setLoadedPages(1);
      setError(null);
    } catch (nextError) {
      if (!isListRequestCurrent(ticket)) return;
      setError(messageFor(nextError, "No pudimos cargar tus notificaciones."));
    } finally {
      if (finishListRequest(ticket)) {
        firstPagePendingRef.current = false;
        setLoading(false);
      }
    }
  }, [beginListRequest, finishListRequest, isListRequestCurrent, unreadOnly]);

  const loadMore = useCallback(
    async (cursor: string) => {
      const ticket = beginListRequest();
      setLoadingMore(true);
      setError(null);

      try {
        const result = await communityApi.notifications(
          {
            unreadOnly,
            cursor,
            limit: NOTIFICATION_PAGE_SIZE,
          },
          ticket.signal,
        );
        if (!isListRequestCurrent(ticket)) return;

        setItems((current) => [...current, ...result.items]);
        setNextCursor(result.nextCursor);
        setLoadedPages((current) => current + 1);
      } catch (nextError) {
        if (!isListRequestCurrent(ticket)) return;
        setError(
          messageFor(nextError, "No pudimos cargar tus notificaciones."),
        );
      } finally {
        if (finishListRequest(ticket)) setLoadingMore(false);
      }
    },
    [beginListRequest, finishListRequest, isListRequestCurrent, unreadOnly],
  );

  const reconcileLoadedWindow = useCallback(async () => {
    if (firstPagePendingRef.current) return;

    const ticket = beginListRequest();
    const reconciled: NotificationView[] = [];
    let cursor: string | undefined;
    let finalCursor: string | null = null;

    try {
      for (let page = 0; page < loadedPages; page += 1) {
        const result = await communityApi.notifications(
          {
            unreadOnly,
            cursor,
            limit: NOTIFICATION_PAGE_SIZE,
          },
          ticket.signal,
        );
        if (!isListRequestCurrent(ticket)) return;

        reconciled.push(...result.items);
        finalCursor = result.nextCursor;
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }

      if (!isListRequestCurrent(ticket)) return;
      setItems(reconciled);
      setNextCursor(finalCursor);
      setError(null);
    } catch {
      // Background reconciliation is best-effort; visible state remains usable.
    } finally {
      finishListRequest(ticket);
    }
  }, [
    beginListRequest,
    finishListRequest,
    isListRequestCurrent,
    loadedPages,
    unreadOnly,
  ]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    setActionBusy(false);
    setLoadingMore(false);
    setOpeningState(null);
  }, [authorityScope]);

  useEffect(() => {
    if (
      !shouldReconcileNotificationTick(
        reconcileTick,
        consumedReconcileTickRef.current,
        {
          authenticated: status === "authenticated",
          firstPagePending: firstPagePendingRef.current,
          loading,
          loadingMore,
          actionBusy,
        },
      )
    ) {
      return;
    }
    consumedReconcileTickRef.current = reconcileTick;
    void reconcileLoadedWindow();
  }, [
    actionBusy,
    loading,
    loadingMore,
    reconcileLoadedWindow,
    reconcileTick,
    status,
  ]);

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
      void reconcileLoadedWindow();
    };

    const startPolling = () => {
      if (document.visibilityState !== "visible" || intervalId !== null) {
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
  }, [busy, loading, reconcileLoadedWindow, status]);

  const markRead = async (id: string) => {
    const ticket = beginActionRequest();
    setActionBusy(true);
    setError(null);

    try {
      await communityApi.markNotificationRead(id, ticket.signal);
      if (!isActionRequestCurrent(ticket)) return;
      setReconcileTick((current) => current + 1);
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
      await communityApi.markAllNotificationsRead(ticket.signal);
      if (!isActionRequestCurrent(ticket)) return;
      setReconcileTick((current) => current + 1);
    } catch (nextError) {
      if (!isActionRequestCurrent(ticket)) return;
      setError(
        messageFor(nextError, "No pudimos actualizar tus notificaciones."),
      );
    } finally {
      if (finishActionRequest(ticket)) setActionBusy(false);
    }
  };

  const acknowledgeAndOpen = async (item: NotificationView, target: string) => {
    if (actionBusy) return;

    const ticket = beginActionRequest();
    setActionBusy(true);
    setOpeningState({ scopeKey: authorityScope, notificationId: item.id });
    setError(null);

    try {
      const result = await communityApi.markNotificationRead(
        item.id,
        ticket.signal,
      );
      if (result.read !== true) {
        throw new Error("Unexpected notification read response");
      }
      if (!isActionRequestCurrent(ticket)) return;
      setReconcileTick((current) => current + 1);
      navigate(target);
    } catch (nextError) {
      if (!isActionRequestCurrent(ticket)) return;
      setError(
        messageFor(
          nextError,
          "No pudimos confirmar la lectura. Seguís en Notificaciones.",
        ),
      );
    } finally {
      if (finishActionRequest(ticket)) setActionBusy(false);
      setOpeningState((current) =>
        current?.scopeKey === authorityScope &&
        current.notificationId === item.id
          ? null
          : current,
      );
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
                const target = notificationTargetPath(item.target);
                return (
                  <li key={item.id} className={item.readAt ? "" : "unread"}>
                    <div>
                      <strong>
                        {item.actor?.displayName ?? "Los Apuntes"}{" "}
                        {labels[item.type]}
                      </strong>
                      <small>{new Date(item.createdAt).toLocaleString()}</small>
                      {target ? (
                        <Link
                          to={target}
                          aria-disabled={actionBusy || undefined}
                          onClick={(event) => {
                            if (
                              event.button !== 0 ||
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey ||
                              event.altKey ||
                              event.defaultPrevented
                            ) {
                              return;
                            }
                            if (actionBusy) {
                              event.preventDefault();
                              return;
                            }
                            if (!item.readAt) {
                              event.preventDefault();
                              void acknowledgeAndOpen(item, target);
                            }
                          }}
                        >
                          {openingNotificationId === item.id
                            ? "Abriendo…"
                            : "Abrir"}
                        </Link>
                      ) : (
                        <small>
                          Esta notificación no tiene un destino navegable.
                        </small>
                      )}
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
                onClick={() => void loadMore(nextCursor)}
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
