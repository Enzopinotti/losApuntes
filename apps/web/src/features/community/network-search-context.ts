import type { ConnectionView, FollowingItem } from "./interfaces";

/**
 * Presentation hints from relations the viewer has actually loaded.
 * A missing match is NOT proof that no relation exists: each list is paged.
 * API mutations and authorization remain authoritative on the server.
 */
export type NetworkSearchRelationship = Readonly<{
  isFollowingKnown: boolean;
  connection: "incoming" | "outgoing" | "accepted" | "reconnect" | null;
  canRequestConnection: boolean;
}>;

export function networkSearchRelationship(
  profileId: string,
  following: readonly FollowingItem[],
  connections: readonly ConnectionView[],
): NetworkSearchRelationship {
  const isFollowingKnown =
    profileId.length > 0 &&
    following.some((item) => item.profile.profileId === profileId);
  const matching = connections.filter(
    (item) => profileId.length > 0 && item.other.profileId === profileId,
  );

  // Prefer live relations over historical terminal rows if an inconsistent
  // page were ever to contain multiple snapshots for the same profile.
  const known =
    matching.find((item) => item.status === "accepted") ??
    matching.find((item) => item.status === "pending") ??
    matching[0];

  const connection =
    known?.status === "accepted"
      ? "accepted"
      : known?.status === "pending"
        ? known.incoming
          ? "incoming"
          : "outgoing"
        : known
          ? "reconnect"
          : null;

  return {
    isFollowingKnown,
    connection,
    canRequestConnection: connection === null || connection === "reconnect",
  };
}
