import { Link } from "react-router-dom";
import type { FeedItem } from "../interfaces";
import { presentFeedItem } from "../feed-item-presentation.mjs";
import { FeedSourceAttribution } from "./FeedSourceAttribution";
import "./FeedItemContext.scss";

export function FeedItemContext({
  item,
  reasonLimit,
}: {
  item: FeedItem;
  reasonLimit?: number;
}) {
  const presentation = presentFeedItem(item, reasonLimit);
  const initials =
    presentation.displayName.trim().slice(0, 1).toLocaleUpperCase("es-AR") ||
    "?";

  return (
    <div className="feed-item-context">
      <span className="feed-item-avatar" aria-hidden="true">
        <span>{initials}</span>
        {presentation.avatarUrl ? (
          <img
            src={presentation.avatarUrl}
            alt=""
            width={44}
            height={44}
            loading="lazy"
            decoding="async"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : null}
      </span>

      <div className="feed-item-context-details">
        <div className="feed-item-byline">
          <FeedSourceAttribution item={item} />
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

export function FeedItemOpenLink({ item }: { item: FeedItem }) {
  const presentation = presentFeedItem(item);

  return (
    <Link className="feed-item-open-link" to={presentation.href}>
      {presentation.actionLabel}
    </Link>
  );
}
