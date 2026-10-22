import { publicProfileAvatarUrl } from "./public-profile-avatar-policy";
import "./public-profile-avatar.scss";

export function PublicProfileAvatar({
  avatarUrl,
  displayName,
  size = "profile",
}: {
  avatarUrl: string | null | undefined;
  displayName: string;
  size?: "profile" | "small" | "compact";
}) {
  const safeAvatarUrl = publicProfileAvatarUrl(avatarUrl);
  const initial =
    displayName.trim().slice(0, 1).toLocaleUpperCase("es-AR") || "?";

  return (
    <span
      className={`public-profile-avatar${size === "small" ? " public-profile-avatar--small" : size === "compact" ? " public-profile-avatar--compact" : ""}`}
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
