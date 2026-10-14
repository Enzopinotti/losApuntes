import { Link } from "react-router-dom";

import "./AuthorProfileLink.scss";

export function AuthorProfileLink({
  profileId,
  displayName,
}: {
  profileId: string | null | undefined;
  displayName: string;
}) {
  const visibleName = displayName.trim() || "Usuario de Los Apuntes";
  if (!profileId || profileId.trim() !== profileId) return visibleName;

  return (
    <Link
      aria-label={`Ver perfil de ${visibleName}`}
      className="author-profile-link"
      to={`/p/${encodeURIComponent(profileId)}`}
    >
      {visibleName}
    </Link>
  );
}
