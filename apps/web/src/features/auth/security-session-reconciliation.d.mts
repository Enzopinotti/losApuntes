export type SessionRevocationStatus = "unknown" | "active" | "revoked";
export type SessionInventoryForReconciliation = Readonly<{
  sessions: readonly Readonly<{ id: string }>[];
  truncated: boolean;
  limit: number;
}>;

export function isUncertainSessionRevocationError(error: unknown): boolean;
export function sessionRevocationReconciliation(
  targetId: string,
  snapshot: SessionInventoryForReconciliation,
): SessionRevocationStatus;
