export const PRODUCT_TAB_ROUTES = [
  "home",
  "search",
  "create",
  "network",
  "profile",
] as const;

export type ProductTabRoute = (typeof PRODUCT_TAB_ROUTES)[number];

export const PRODUCT_TAB_LABELS: Record<ProductTabRoute, string> = {
  home: "Inicio",
  search: "Buscar",
  create: "Crear",
  network: "Red",
  profile: "Perfil",
};

export function navigationAuthorityKey(
  userId: string,
  sessionId: string,
): string {
  return `${userId}:${sessionId}`;
}

export function activeNavigationAuthorityKey(
  authorityKey: string | null,
  isFocused: boolean,
  appState: string,
): string | null {
  return authorityKey && isFocused && appState === "active"
    ? authorityKey
    : null;
}
