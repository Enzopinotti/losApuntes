import type { MouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../../contexts/useAuth";
import type { FeedItem } from "../interfaces";
import type { HomeFeedIntent } from "../feed-navigation.mjs";
import {
  feedScrollAuthorityScope,
  rememberFeedScrollPosition,
} from "../feed-scroll-restoration.mjs";

export function FeedSourceAttribution({
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
  const feedReturnState = {
    feedReturnTo: returnTo,
    feedReturnKey: returnKey,
    ...(homeIntent ? { feedReturnHomeIntent: homeIntent } : {}),
  };
  const rememberFeedPosition = (event: MouseEvent<HTMLAnchorElement>) => {
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
  };

  if (item.source.kind === "campus_organization") {
    return (
      <Link
        className="feed-source-link"
        to={`/organizations/${encodeURIComponent(item.source.organization.id)}`}
        state={feedReturnState}
        onClick={rememberFeedPosition}
      >
        {item.source.organization.name}
      </Link>
    );
  }

  const profileId = item.author.profileId;
  if (profileId && profileId.trim() === profileId) {
    return (
      <Link
        className="feed-source-link"
        to={`/p/${encodeURIComponent(profileId)}`}
        state={feedReturnState}
        onClick={rememberFeedPosition}
      >
        {item.author.displayName}
      </Link>
    );
  }

  return <span>{item.author.displayName}</span>;
}
