import { useState } from "react";
import type { OrganizationCard } from "./interfaces";
import { isOrganizationsApiError, organizationsApi } from "./services/organizationsService";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";

function messageFor(error: unknown): string {
  return isOrganizationsApiError(error)
    ? error.message
    : "No pudimos confirmar el cambio. Consultá el estado de la organización.";
}

function isAmbiguousMutationError(error: unknown): boolean {
  return (
    isOrganizationsApiError(error) &&
    (error.status === 0 || error.status >= 500)
  );
}

export function OrganizationDirectoryFollowAction({
  organization,
  authScopeKey,
  onFollowingChanged,
}: {
  organization: OrganizationCard;
  authScopeKey: string;
  onFollowingChanged: (organizationId: string, following: boolean) => void;
}) {
  const scopeKey = `organization-directory-follow:${authScopeKey}:${organization.id}`;
  const {
    begin: beginAction,
    isCurrent: isActionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(scopeKey);
  const [followingState, setFollowingState] = useState<{
    scopeKey: string;
    value: boolean;
  } | null>(null);
  const following =
    followingState?.scopeKey === scopeKey
      ? followingState.value
      : Boolean(organization.viewer?.following);
  const [busyState, setBusyState] = useState<{
    scopeKey: string;
    value: boolean;
  } | null>(null);
  const busy = busyState?.scopeKey === scopeKey && busyState.value;
  const [feedbackState, setFeedbackState] = useState<{
    scopeKey: string;
    message: string;
    isError: boolean;
  } | null>(null);
  const feedback = feedbackState?.scopeKey === scopeKey ? feedbackState : null;

  const toggleFollowing = async () => {
    if (busy) return;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    const desiredFollowing = !following;
    setBusyState({ scopeKey, value: true });
    setFeedbackState(null);

    try {
      const result = !desiredFollowing
        ? await organizationsApi.unfollow(organization.id, ticket.signal)
        : await organizationsApi.follow(organization.id, ticket.signal);
      if (!isActionCurrent(ticket)) return;
      setFollowingState({ scopeKey, value: result.following });
      onFollowingChanged(organization.id, result.following);
      setFeedbackState({
        scopeKey,
        message: result.following
          ? `Ahora seguís ${organization.name}.`
          : `Dejaste de seguir ${organization.name}.`,
        isError: false,
      });
    } catch (error) {
      if (!isActionCurrent(ticket)) return;
      if (isAmbiguousMutationError(error)) {
        try {
          const result = await organizationsApi.get(
            organization.id,
            ticket.signal,
          );
          if (!isActionCurrent(ticket)) return;
          const confirmedFollowing = Boolean(
            result.organization.viewer?.following,
          );
          setFollowingState({ scopeKey, value: confirmedFollowing });
          onFollowingChanged(organization.id, confirmedFollowing);
          const confirmed = confirmedFollowing === desiredFollowing;
          setFeedbackState({
            scopeKey,
            message: confirmed
              ? confirmedFollowing
                ? `Ahora seguís ${organization.name}.`
                : `Dejaste de seguir ${organization.name}.`
              : confirmedFollowing
                ? `Todavía seguís ${organization.name}; el cambio no se completó.`
                : `Todavía no seguís ${organization.name}; el cambio no se completó.`,
            isError: !confirmed,
          });
        } catch {
          if (!isActionCurrent(ticket)) return;
          setFeedbackState({
            scopeKey,
            message: messageFor(error),
            isError: true,
          });
        }
      } else {
        setFeedbackState({
          scopeKey,
          message: messageFor(error),
          isError: true,
        });
      }
    } finally {
      if (finishAction(ticket)) {
        setBusyState({ scopeKey, value: false });
      }
    }
  };

  return (
    <div className="organization-directory-follow">
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggleFollowing()}
        aria-label={`${following ? "Dejar de seguir" : "Seguir"} ${organization.name}`}
      >
        {busy ? "Actualizando…" : following ? "Dejar de seguir" : "Seguir"}
      </button>
      {feedback && (
        <span role={feedback.isError ? "alert" : "status"}>
          {feedback.message}
        </span>
      )}
    </div>
  );
}

