export type MobileErrorBoundaryRecoveryState = Readonly<{
  failed: boolean;
  routeKey: string;
}>;

/**
 * A new pathname is a new navigation attempt. Recover from a previous
 * screen's render failure without swallowing failures on the same route.
 */
export function recoverMobileErrorBoundaryOnRouteChange(
  routeKey: string,
  state: MobileErrorBoundaryRecoveryState,
): MobileErrorBoundaryRecoveryState | null {
  return routeKey === state.routeKey ? null : { failed: false, routeKey };
}
