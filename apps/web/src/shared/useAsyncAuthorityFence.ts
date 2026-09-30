import { useCallback, useEffect, useRef } from "react";

export type AsyncAuthorityTicket = {
  epoch: number;
  scopeKey: string;
  signal: AbortSignal;
};

export function useAsyncAuthorityFence(scopeKey: string) {
  const epochRef = useRef(0);
  const previousScopeRef = useRef(scopeKey);
  const controllerRef = useRef<AbortController | null>(null);

  if (previousScopeRef.current !== scopeKey) {
    previousScopeRef.current = scopeKey;
    epochRef.current += 1;
  }

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, [scopeKey]);

  useEffect(
    () => () => {
      epochRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [],
  );

  const begin = useCallback((): AsyncAuthorityTicket => {
    epochRef.current += 1;
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    return {
      epoch: epochRef.current,
      scopeKey,
      signal: controller.signal,
    };
  }, [scopeKey]);

  const isCurrent = useCallback((ticket: AsyncAuthorityTicket): boolean => {
    return (
      ticket.epoch === epochRef.current &&
      ticket.scopeKey === previousScopeRef.current &&
      !ticket.signal.aborted
    );
  }, []);

  const finish = useCallback(
    (ticket: AsyncAuthorityTicket): boolean => {
      if (!isCurrent(ticket)) return false;
      controllerRef.current = null;
      return true;
    },
    [isCurrent],
  );

  const invalidate = useCallback(() => {
    epochRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  return { begin, isCurrent, finish, invalidate };
}
