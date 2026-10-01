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

import type { SessionSnapshot } from "@/features/session/session-controller";
import { mobileSessionController } from "@/features/session/session-runtime";

interface SessionContextValue {
  snapshot: SessionSnapshot;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  retryRestore(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(
    mobileSessionController.getSnapshot(),
  );
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => mobileSessionController.subscribe(setSnapshot), []);
  useEffect(() => {
    void mobileSessionController.restore();
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "active" && previousState !== "active") {
        void mobileSessionController.revalidateCurrent();
        return;
      }

      if (nextState !== "active") {
        mobileSessionController.suspend();
      }
    });

    return () => subscription.remove();
  }, []);

  const login = useCallback(
    (email: string, password: string) =>
      mobileSessionController.login({
        email: email.trim().toLowerCase(),
        password,
      }),
    [],
  );
  const logout = useCallback(() => mobileSessionController.logout(), []);
  const retryRestore = useCallback(() => mobileSessionController.restore(), []);

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
