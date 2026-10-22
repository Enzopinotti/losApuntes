import { publicProfileAvatarUrl } from "./public-profile-avatar-policy";
import "./public-profile-avatar.scss";

const sizeClasses = {
  profile: "",
  small: " public-profile-avatar--small",
  compact: " public-profile-avatar--compact",
  feed: " public-profile-avatar--feed",
} as const;

export function PublicProfileAvatar({
  avatarUrl,
  displayName,
  size = "profile",
}: {
  avatarUrl: string | null | undefined;
  displayName: string;
  size?: keyof typeof sizeClasses;
}) {
  const safeAvatarUrl = publicProfileAvatarUrl(avatarUrl);
  const initial =
    displayName.trim().slice(0, 1).toLocaleUpperCase("es-AR") || "?";

  return (
    <span
      className={`public-profile-avatar${sizeClasses[size]}`}
      aria-hidden="true"
    >
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
