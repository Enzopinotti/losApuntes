import { useCallback, useEffect, useRef } from "react";
import {
  AsyncAuthorityFenceController,
  type AsyncAuthorityTicket,
} from "./asyncAuthorityFenceController";

export type { AsyncAuthorityTicket };

export function useAsyncAuthorityFence(scopeKey: string) {
  const controllerRef = useRef<AsyncAuthorityFenceController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new AsyncAuthorityFenceController(scopeKey);
  }

  controllerRef.current.syncScope(scopeKey);

  useEffect(() => {
    controllerRef.current?.abortActive();
  }, [scopeKey]);

  useEffect(
    () => () => {
      controllerRef.current?.invalidate();
    },
    [],
  );

  const begin = useCallback((): AsyncAuthorityTicket => {
    return controllerRef.current!.begin();
  }, []);

  const isCurrent = useCallback((ticket: AsyncAuthorityTicket): boolean => {
    return controllerRef.current!.isCurrent(ticket);
  }, []);

  const finish = useCallback((ticket: AsyncAuthorityTicket): boolean => {
    return controllerRef.current!.finish(ticket);
  }, []);

  const invalidate = useCallback(() => {
    controllerRef.current!.invalidate();
  }, []);

  return { begin, isCurrent, finish, invalidate };
}
