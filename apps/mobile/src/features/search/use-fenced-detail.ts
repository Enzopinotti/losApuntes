import { useEffect, useRef, useState } from "react";

import { ApiRequestError } from "@/services/api/client";

export type FencedDetailSnapshot<T> =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | { kind: "ready"; authorityKey: string; data: T }
  | {
      kind: DetailFailureKind;
      authorityKey: string;
    };

export type DetailFailureKind =
  "offline" | "timeout" | "server_unavailable" | "restricted" | "error";

const failureKind = (error: unknown): DetailFailureKind => {
  if (!(error instanceof ApiRequestError)) return "error";
  if (error.code === "ACCOUNT_RESTRICTED") return "restricted";
  if (error.kind === "offline") return "offline";
  if (error.kind === "timeout") return "timeout";
  if (error.kind === "server_unavailable") return "server_unavailable";
  return "error";
};

export function useFencedDetail<T>(
  authorityKey: string | null,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [snapshot, setSnapshot] = useState<FencedDetailSnapshot<T>>({
    kind: "idle",
  });
  const [retryVersion, setRetryVersion] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    if (!authorityKey) {
      generation.current += 1;
      setSnapshot({ kind: "idle" });
      return;
    }

    generation.current += 1;
    const requestGeneration = generation.current;
    const controller = new AbortController();
    setSnapshot({ kind: "loading", authorityKey });

    void load(controller.signal)
      .then((data) => {
        if (
          controller.signal.aborted ||
          generation.current !== requestGeneration
        ) {
          return;
        }
        setSnapshot({ kind: "ready", authorityKey, data });
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          generation.current !== requestGeneration
        ) {
          return;
        }
        setSnapshot({ kind: failureKind(error), authorityKey });
      });

    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [authorityKey, load, retryVersion]);

  return {
    snapshot,
    retry: () => setRetryVersion((version) => version + 1),
  };
}
