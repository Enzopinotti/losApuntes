export type AuthActionLocation = {
  hash: string;
  search: string;
};

function tokenFromParams(value: string): string | null {
  if (!value) return null;
  const params = new URLSearchParams(
    value.startsWith("#") ? value.slice(1) : value,
  );
  return params.get("token");
}

export function readAuthActionToken(location: AuthActionLocation): string {
  const fragmentToken = tokenFromParams(location.hash);
  if (fragmentToken) return fragmentToken;

  return tokenFromParams(location.search) ?? "";
}

export function scrubAuthActionTokenFromHistory(): void {
  window.history.replaceState(null, "", window.location.pathname);
}
