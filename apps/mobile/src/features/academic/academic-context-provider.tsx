import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { useSession } from "@/features/session/session-provider";
import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import { AcademicMobileApi } from "./academic-api";
import {
  AcademicContextController,
  type AcademicContextSnapshot,
} from "./academic-context-controller";

const academicApi = new AcademicMobileApi(
  mobileSessionController,
  mobileApiClient,
);
const controller = new AcademicContextController(academicApi);

interface AcademicContextValue {
  snapshot: AcademicContextSnapshot;
  retry(): Promise<void>;
  selectAffiliation(affiliationId: string): Promise<void>;
  selectSubject(subjectParticipationId: string | null): Promise<void>;
}

const Context = createContext<AcademicContextValue | null>(null);

export function AcademicContextProvider({ children }: { children: ReactNode }) {
  const { snapshot: session } = useSession();
  const [snapshot, setSnapshot] = useState<AcademicContextSnapshot>(
    controller.getSnapshot(),
  );
  const appStateRef = useRef(AppState.currentState);

  const authorityKey =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityRef = useRef<string | null>(authorityKey);
  authorityRef.current = authorityKey;

  useEffect(() => controller.subscribe(setSnapshot), []);

  useEffect(() => {
    if (!authorityKey) {
      controller.reset();
      return;
    }

    if (AppState.currentState !== "active") {
      controller.suspend();
      return;
    }

    void controller.restore(authorityKey);
  }, [authorityKey]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "active" && previousState !== "active") {
        const currentAuthority = authorityRef.current;
        if (currentAuthority) void controller.restore(currentAuthority);
        return;
      }

      if (nextState !== "active") {
        controller.suspend();
      }
    });

    return () => subscription.remove();
  }, []);

  const retry = useCallback(async () => {
    const currentAuthority = authorityRef.current;
    if (currentAuthority) await controller.restore(currentAuthority);
  }, []);

  const selectAffiliation = useCallback(async (affiliationId: string) => {
    const currentAuthority = authorityRef.current;
    if (!currentAuthority) return;
    await controller.selectAffiliation(currentAuthority, affiliationId);
  }, []);

  const selectSubject = useCallback(
    async (subjectParticipationId: string | null) => {
      const currentAuthority = authorityRef.current;
      if (!currentAuthority) return;
      await controller.selectSubject(currentAuthority, subjectParticipationId);
    },
    [],
  );

  const value = useMemo(
    () => ({ snapshot, retry, selectAffiliation, selectSubject }),
    [snapshot, retry, selectAffiliation, selectSubject],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAcademicContext(): AcademicContextValue {
  const value = useContext(Context);
  if (!value) {
    throw new Error(
      "useAcademicContext must be used inside AcademicContextProvider",
    );
  }
  return value;
}
