import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../../contexts/useAuth";
import { PublicProfileAvatar } from "../../profile/public-profile-avatar";
import type { FeedItem } from "../interfaces";
import { presentFeedItem } from "../feed-item-presentation.mjs";
import type { HomeFeedIntent } from "../feed-navigation.mjs";
import {
  feedScrollAuthorityScope,
  rememberFeedScrollPosition,
} from "../feed-scroll-restoration.mjs";
import { FeedSourceAttribution } from "./FeedSourceAttribution";
import "./FeedItemContext.scss";

export function FeedItemContext({
  item,
  reasonLimit,
  homeIntent,
}: {
  item: FeedItem;
  reasonLimit?: number;
  homeIntent?: HomeFeedIntent;
}) {
  const presentation = presentFeedItem(item, reasonLimit);

  return (
    <div className="feed-item-context">
      <PublicProfileAvatar
        avatarUrl={presentation.avatarUrl}
        displayName={presentation.displayName}
        size="feed"
      />

      <div className="feed-item-context-details">
        <div className="feed-item-byline">
          <FeedSourceAttribution item={item} homeIntent={homeIntent} />
        </div>
        <div className="feed-item-metadata">
          <span className="feed-item-kind">{presentation.kindLabel}</span>
          {presentation.subjectName ? (
            <span className="feed-item-subject">
              Materia: {presentation.subjectName}
            </span>
          ) : null}
          {presentation.verifiedOrganization ? (
            <span className="feed-item-verified">Organización verificada</span>
          ) : null}
        </div>
        {presentation.reasonLabels.length > 0 ? (
          <div className="feed-item-reasons" aria-label="Por qué aparece">
            {presentation.reasonLabels.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
          </div>
        ) : null}
      </div>

      {presentation.createdAtLabel ? (
        <time className="feed-item-date" dateTime={item.createdAt}>
          {presentation.createdAtLabel}
        </time>
      ) : null}
    </div>
  );
}

export function FeedItemOpenLink({
  item,
  homeIntent,
}: {
  item: FeedItem;
  homeIntent?: HomeFeedIntent;
}) {
  const location = useLocation();
  const { status, user, session } = useAuth();
  const authorityScope = feedScrollAuthorityScope(
    status,
    user?.id,
    session?.id,
  );
  const returnTo = `${location.pathname}${location.search}`;
  const returnKey = location.key || "default";
  const presentation = presentFeedItem(item);

  return (
    <Link
      className="feed-item-open-link"
      to={presentation.href}
      state={{
        feedReturnTo: returnTo,
        feedReturnKey: returnKey,
        ...(homeIntent ? { feedReturnHomeIntent: homeIntent } : {}),
      }}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        rememberFeedScrollPosition(returnKey, authorityScope, window.scrollY);
      }}
    >
      {presentation.actionLabel}
    </Link>
  );
}
