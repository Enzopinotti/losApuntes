import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { NotificationView } from "../features/community/interfaces";
import {
  communityApi,
  isCommunityApiError,
} from "../features/community/services/communityService";
import "./Community.scss";

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

const Notifications = () => {
  const [items, setItems] = useState<NotificationView[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await communityApi.notifications({ unreadOnly });
      setItems(result.items);
    } catch (nextError) {
      setError(
        isCommunityApiError(nextError)
          ? nextError.message
          : "No pudimos cargar tus notificaciones.",
      );
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await communityApi.markNotificationRead(id);
      await load();
    } catch (nextError) {
      setError(
        isCommunityApiError(nextError)
          ? nextError.message
          : "No pudimos marcar la notificación.",
      );
    } finally {
      setBusy(false);
    }
  };

  const markAll = async () => {
    setBusy(true);
    setError(null);
    try {
      await communityApi.markAllNotificationsRead();
      await load();
    } catch (nextError) {
      setError(
        isCommunityApiError(nextError)
          ? nextError.message
          : "No pudimos actualizar tus notificaciones.",
      );
    } finally {
      setBusy(false);
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
        )}
      </section>
    </section>
  );
};

export default Notifications;
