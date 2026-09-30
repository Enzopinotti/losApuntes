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

import { mobileRuntime } from "@/config/runtime";
import { createSerializedCredentialStore } from "@/features/session/serialized-credential-store";
import {
  SessionController,
  type SessionSnapshot,
} from "@/features/session/session-controller";
import { secureSessionCredentialStore } from "@/platform/session-credential-store";
import { MobileApiClient } from "@/services/api/client";

const api = new MobileApiClient(mobileRuntime.apiOrigin);
const credentialStore = createSerializedCredentialStore(
  secureSessionCredentialStore,
);
const controller = new SessionController(api, credentialStore);

interface SessionContextValue {
  snapshot: SessionSnapshot;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  retryRestore(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(
    controller.getSnapshot(),
  );
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => controller.subscribe(setSnapshot), []);
  useEffect(() => {
    void controller.restore();
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "active" && previousState !== "active") {
        void controller.revalidateCurrent();
        return;
      }

      if (nextState !== "active") {
        controller.suspend();
      }
    });

    return () => subscription.remove();
  }, []);

  const login = useCallback(
    (email: string, password: string) =>
      controller.login({ email: email.trim().toLowerCase(), password }),
    [],
  );
  const logout = useCallback(() => controller.logout(), []);
  const retryRestore = useCallback(() => controller.restore(), []);

  const value = useMemo(
    () => ({ snapshot, login, logout, retryRestore }),
    [snapshot, login, logout, retryRestore],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
