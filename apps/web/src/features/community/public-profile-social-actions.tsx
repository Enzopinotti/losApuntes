import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ConnectionView } from "./interfaces";
import {
  communityApi,
  isCommunityApiError,
} from "./services/communityService";
import { networkConnectionStatusLabel } from "./network-presentation";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";

type SocialAction = "follow" | "connect";

interface SocialState {
  scopeKey: string;
  busy: SocialAction | null;
  followingConfirmed: boolean | null;
  connectionConfirmed: ConnectionView | null;
  feedback: string | null;
  error: string | null;
}

function messageForSocialError(error: unknown): string {
  if (isCommunityApiError(error)) {
    switch (error.code) {
      case "EMAIL_VERIFICATION_REQUIRED":
        return "Verificá tu email antes de seguir o conectar con personas.";
      case "SOCIAL_PROFILE_REQUIRED":
        return "Completá tu perfil para participar en la red.";
      case "SOCIAL_SELF_RELATION_INVALID":
        return "Este es tu propio perfil. Podés editarlo desde Mi perfil.";
      case "SOCIAL_PROFILE_NOT_FOUND":
        return "Este perfil ya no está disponible para relacionarte.";
      default:
        return error.message;
    }
  }
  return "No pudimos completar esta acción. Probá nuevamente.";
}

/**
 * A follow/connection is displayed as confirmed only after the server replies.
 * We intentionally do not guess existing relationships from partial lists.
 */
export function PublicProfileSocialActions({
  profileId,
  viewerScopeKey,
}: {
  profileId: string;
  viewerScopeKey: string;
}) {
  const scopeKey = `${viewerScopeKey}:profile:${profileId}`;
  const { begin, isCurrent, finish } = useAsyncAuthorityFence(
    `public-profile-social:${scopeKey}`,
  );
  const inFlight = useRef<{ scopeKey: string; action: SocialAction } | null>(
    null,
  );
  const [state, setState] = useState<SocialState | null>(null);
  const current = state?.scopeKey === scopeKey ? state : null;
  const busy = current?.busy ?? null;
  const confirmedConnection = current?.connectionConfirmed ?? null;
  const connectionPendingOrAccepted =
    confirmedConnection?.status === "pending" ||
    confirmedConnection?.status === "accepted";

  const run = async (action: SocialAction) => {
    if (inFlight.current?.scopeKey === scopeKey) return;
    if (action === "connect" && connectionPendingOrAccepted) return;

    inFlight.current = { scopeKey, action };
    const ticket = begin();
    setState((previous) => ({
      scopeKey,
      busy: action,
      followingConfirmed:
        previous?.scopeKey === scopeKey
          ? previous.followingConfirmed
          : null,
      connectionConfirmed:
        previous?.scopeKey === scopeKey
          ? previous.connectionConfirmed
          : null,
      feedback: null,
      error: null,
    }));

    try {
      if (action === "follow") {
        if (current?.followingConfirmed === true) {
          await communityApi.unfollow(profileId, ticket.signal);
          if (!isCurrent(ticket)) return;
          setState((previous) =>
            previous?.scopeKey === scopeKey
              ? {
                  ...previous,
                  followingConfirmed: false,
                  feedback: "Dejaste de seguir este perfil.",
                }
              : previous,
          );
        } else {
          const result = await communityApi.follow(profileId, ticket.signal);
          if (!isCurrent(ticket)) return;
          if (result.following !== true) {
            throw new Error("Unexpected follow response");
          }
          setState((previous) =>
            previous?.scopeKey === scopeKey
              ? {
                  ...previous,
                  followingConfirmed: true,
                  feedback: "Ahora seguís este perfil.",
                }
              : previous,
          );
        }
      } else {
        const result = await communityApi.requestConnection(
          profileId,
          ticket.signal,
        );
        if (!isCurrent(ticket)) return;
        setState((previous) =>
          previous?.scopeKey === scopeKey
            ? {
                ...previous,
                connectionConfirmed: result.connection,
                feedback: networkConnectionStatusLabel(result.connection),
              }
            : previous,
        );
      }
    } catch (error) {
      if (!isCurrent(ticket)) return;
      setState((previous) =>
        previous?.scopeKey === scopeKey
          ? { ...previous, error: messageForSocialError(error), feedback: null }
          : previous,
      );
    } finally {
      if (inFlight.current?.scopeKey === scopeKey) {
        inFlight.current = null;
      }
      if (finish(ticket)) {
        setState((previous) =>
          previous?.scopeKey === scopeKey
            ? { ...previous, busy: null }
            : previous,
        );
      }
    }
  };

  return (
    <section className="public-profile-social" aria-label="Acciones de red">
      <div className="public-profile-social-actions">
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void run("follow")}
        >
          {busy === "follow"
            ? "Actualizando…"
            : current?.followingConfirmed === true
              ? "Dejar de seguir"
              : "Seguir"}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={Boolean(busy) || connectionPendingOrAccepted}
          onClick={() => void run("connect")}
        >
          {busy === "connect"
            ? "Enviando…"
            : confirmedConnection?.status === "accepted"
              ? "Conectados"
              : confirmedConnection?.status === "pending"
                ? "Solicitud pendiente"
                : "Conectar"}
        </button>
        <Link to="/network">Ir a mi Red</Link>
      </div>
      {current?.feedback && (
        <p className="profile-success" role="status">
          {current.feedback}
        </p>
      )}
      {current?.error && (
        <p className="profile-error" role="alert">
          {current.error}
        </p>
      )}
      <p className="public-profile-social-help">
        Seguir no crea una conexión. Una conexión requiere aceptación de la
        otra persona.
      </p>
    </section>
  );
}
