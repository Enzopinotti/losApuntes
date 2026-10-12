import type { CommunityPerson } from "@losapuntes/contracts/social-qa";

export interface CommunityAuthorAction {
  accessibilityHint: string;
  accessibilityLabel: string;
  displayName: string;
  href: {
    pathname: "/profiles/[profileId]";
    params: { profileId: string };
  };
}

export function communityAuthorAction(
  author: CommunityPerson | null,
): CommunityAuthorAction | null {
  const profileId = author?.profileId;
  if (!profileId || profileId.trim() !== profileId) return null;

  const displayName = author.displayName.trim() || "Persona de la comunidad";
  return {
    accessibilityHint: `Abre el perfil público de ${displayName}.`,
    accessibilityLabel: `Abrir perfil de ${displayName}`,
    displayName,
    href: {
      pathname: "/profiles/[profileId]",
      params: { profileId },
    },
  };
}
