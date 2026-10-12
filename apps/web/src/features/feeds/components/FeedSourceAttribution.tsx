import { Link } from "react-router-dom";
import type { FeedItem } from "../interfaces";

export function FeedSourceAttribution({ item }: { item: FeedItem }) {
  if (item.source.kind === "campus_organization") {
    return (
      <Link
        className="feed-source-link"
        to={`/organizations/${encodeURIComponent(item.source.organization.id)}`}
      >
        {item.source.organization.name}
      </Link>
    );
  }

  if (item.author.profileId) {
    return (
      <Link
        className="feed-source-link"
        to={`/p/${encodeURIComponent(item.author.profileId)}`}
      >
        {item.author.displayName}
      </Link>
    );
  }

  return <span>{item.author.displayName}</span>;
}
