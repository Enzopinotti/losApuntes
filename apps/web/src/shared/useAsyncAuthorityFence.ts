import { useCallback, useEffect, useRef } from "react";
import {
  AsyncAuthorityFence,
  type AsyncAuthorityTicket,
} from "./asyncAuthorityFence";

export type { AsyncAuthorityTicket } from "./asyncAuthorityFence";

export function useAsyncAuthorityFence(scopeKey: string) {
  const fenceRef = useRef<AsyncAuthorityFence | null>(null);

  if (!fenceRef.current) {
    fenceRef.current = new AsyncAuthorityFence(scopeKey);
  } else {
    fenceRef.current.setScope(scopeKey);
  }

  const fence = fenceRef.current;
  const begin = useCallback(
    (): AsyncAuthorityTicket => fence.begin(scopeKey),
    [fence, scopeKey],
  );
  const isCurrent = useCallback(
    (ticket: AsyncAuthorityTicket): boolean => fence.isCurrent(ticket),
    [fence],
  );
  const finish = useCallback(
    (ticket: AsyncAuthorityTicket): boolean => fence.finish(ticket),
    [fence],
  );
  const invalidate = useCallback(() => fence.invalidate(), [fence]);

  useEffect(
    () => () => {
      fence.dispose();
    },
    [fence],
  );

  return { begin, isCurrent, finish, invalidate };
}
