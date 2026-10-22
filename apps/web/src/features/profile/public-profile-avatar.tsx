import { publicProfileAvatarUrl } from "./public-profile-avatar-policy";

export function PublicProfileAvatar({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null | undefined;
  displayName: string;
}) {
  const safeAvatarUrl = publicProfileAvatarUrl(avatarUrl);
  const initial =
    displayName.trim().slice(0, 1).toLocaleUpperCase("es-AR") || "?";

  return (
    <span className="public-profile-avatar" aria-hidden="true">
      <span>{initial}</span>
      {safeAvatarUrl ? (
        <img
          alt=""
          decoding="async"
          height={80}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
          src={safeAvatarUrl}
          width={80}
        />
      ) : null}
    </span>
  );
}
