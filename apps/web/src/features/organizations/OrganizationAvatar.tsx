import { PublicProfileAvatar } from "../profile/public-profile-avatar";

export function OrganizationAvatar({
  avatarUrl,
  name,
  size = "small",
}: {
  avatarUrl: string | null | undefined;
  name: string;
  size?: "compact" | "small" | "profile";
}) {
  return (
    <PublicProfileAvatar avatarUrl={avatarUrl} displayName={name} size={size} />
  );
}
