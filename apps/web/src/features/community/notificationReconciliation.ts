export type NotificationReconciliationState = Readonly<{
  authenticated: boolean;
  firstPagePending: boolean;
  loading: boolean;
  loadingMore: boolean;
  actionBusy: boolean;
}>;

export function shouldReconcileNotificationTick(
  tick: number,
  consumedTick: number,
  state: NotificationReconciliationState,
): boolean {
  return (
    tick > consumedTick &&
    state.authenticated &&
    !state.firstPagePending &&
    !state.loading &&
    !state.loadingMore &&
    !state.actionBusy
  );
}
