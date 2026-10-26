import { Link } from "react-router-dom";
import { PublicProfileAvatar } from "./public-profile-avatar";

import "./AuthorProfileLink.scss";

export function AuthorProfileLink({
  profileId,
  displayName,
  avatarUrl,
}: {
  profileId: string | null | undefined;
  displayName: string;
  avatarUrl?: string | null;
}) {
  const visibleName = displayName.trim() || "Usuario de Los Apuntes";
  if (!profileId || profileId.trim() !== profileId) return visibleName;

  return (
    <Link
      aria-label={`Ver perfil de ${visibleName}`}
      className="author-profile-link"
      to={`/p/${encodeURIComponent(profileId)}`}
    >
      <PublicProfileAvatar
        avatarUrl={avatarUrl}
        displayName={visibleName}
        size="compact"
      />
      {visibleName}
    </Link>
  );
}
