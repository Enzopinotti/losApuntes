import { AppState } from "react-native";
import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { academicContextBelongsToSession } from "@/features/home/home-controller";
import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { useAcademicContext } from "@/features/academic/academic-context-provider";
import { useSession } from "@/features/session/session-provider";

import {
  resolveQuestionScope,
  type QuestionScope,
} from "./community-controller";

export type CommunityAuthorityGate =
  | "ready"
  | "auth_required"
  | "restricted"
  | "blurred"
  | "suspended"
  | "revalidating"
  | "context_loading"
  | "context_unavailable"
  | "offline"
  | "timeout"
  | "server_unavailable"
  | "authority_mismatch"
  | "error";

export interface CommunityAuthority {
  authorityKey: string | null;
  gate: CommunityAuthorityGate;
  scope: QuestionScope;
  retryAcademic(): Promise<void>;
}

export function useCommunityAuthority(): CommunityAuthority {
  const { snapshot: session } = useSession();
  const { snapshot: academic, retry: retryAcademic } = useAcademicContext();
  const focused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState ?? "active");
  const [awaitingRevalidation, setAwaitingRevalidation] = useState(
    AppState.currentState !== "active",
  );
  const awaitingRevalidationRef = useRef(AppState.currentState !== "active");
  const sawRestoreRef = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
      if (nextState !== "active") {
        awaitingRevalidationRef.current = true;
        sawRestoreRef.current = false;
        setAwaitingRevalidation(true);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!awaitingRevalidationRef.current || appState !== "active") return;

    if (academic.kind === "loading" || academic.kind === "unavailable") {
      sawRestoreRef.current = true;
      return;
    }
    if (
      sawRestoreRef.current &&
      (academic.kind === "ready" || academic.kind === "no_context")
    ) {
      awaitingRevalidationRef.current = false;
      sawRestoreRef.current = false;
      setAwaitingRevalidation(false);
    }
  }, [academic, appState]);

  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const academicData =
    academic.kind === "ready" || academic.kind === "no_context"
      ? academic.data
      : null;
  const contextBelongsToSession = academicContextBelongsToSession(
    sessionAuthority,
    academicData?.contextAuthorityKey ?? null,
  );
  const authorityKey =
    sessionAuthority && academicData && contextBelongsToSession
      ? `${sessionAuthority}:${academicData.contextAuthorityKey}`
      : null;

  let gate: CommunityAuthorityGate;
  if (session.kind === "restricted") {
    gate = "restricted";
  } else if (session.kind !== "authenticated") {
    gate = "auth_required";
  } else if (!focused) {
    gate = "blurred";
  } else if (appState !== "active") {
    gate = "suspended";
  } else if (awaitingRevalidation) {
    gate = "revalidating";
  } else if (academic.kind === "ready" || academic.kind === "no_context") {
    gate = contextBelongsToSession ? "ready" : "authority_mismatch";
  } else if (academic.kind === "offline") {
    gate = "offline";
  } else if (academic.kind === "timeout") {
    gate = "timeout";
  } else if (academic.kind === "server_unavailable") {
    gate = "server_unavailable";
  } else if (academic.kind === "error") {
    gate = "error";
  } else if (academic.kind === "unavailable") {
    gate = "context_unavailable";
  } else {
    gate = "context_loading";
  }

  const scope =
    gate === "ready" && academicData
      ? resolveQuestionScope(academicData.context, academicData.participations)
      : { kind: "unresolved" as const };

  return {
    authorityKey: gate === "ready" ? authorityKey : null,
    gate,
    scope,
    retryAcademic,
  };
}
