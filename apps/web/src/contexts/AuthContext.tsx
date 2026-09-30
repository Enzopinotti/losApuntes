import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthStatus,
  AuthUser,
  PublicAuthSession,
} from "../features/auth/interfaces";
import {
  publishAuthAuthorityChanged,
  subscribeAuthAuthorityChanged,
} from "../features/auth/authAuthorityChannel";
import { authApi, isAuthApiError } from "../features/auth/services/authService";
import { AuthContext } from "./auth-context";

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  session: PublicAuthSession | null;
  lastErrorCode: string | null;
};

const initialState: AuthState = {
  status: "restoring",
  user: null,
  session: null,
  lastErrorCode: null,
};

const FOREGROUND_REVALIDATE_AFTER_MS = 30_000;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>(initialState);
  const generationRef = useRef(0);
  const lastValidatedAtRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);

  const performRefresh = useCallback(async (): Promise<boolean> => {
    const generation = ++generationRef.current;

    try {
      const snapshot = await authApi.me();

      if (generation !== generationRef.current) {
        return false;
      }

      lastValidatedAtRef.current = Date.now();
      setState({
        status: "authenticated",
        user: snapshot.user,
        session: snapshot.session,
        lastErrorCode: null,
      });
      return true;
    } catch (error) {
      if (generation !== generationRef.current) {
        return false;
      }

      if (isAuthApiError(error)) {
        if (error.code === "ACCOUNT_RESTRICTED") {
          lastValidatedAtRef.current = Date.now();
          setState({
            status: "restricted",
            user: null,
            session: null,
            lastErrorCode: error.code,
          });
          return false;
        }

        if (error.code === "AUTHENTICATION_REQUIRED" || error.status === 401) {
          lastValidatedAtRef.current = Date.now();
          setState({
            status: "anonymous",
            user: null,
            session: null,
            lastErrorCode: null,
          });
          return false;
        }

        setState((previous) =>
          previous.status === "authenticated"
            ? {
                ...previous,
                lastErrorCode: error.code,
              }
            : {
                status: "unavailable",
                user: null,
                session: null,
                lastErrorCode: error.code,
              },
        );
        return false;
      }

      setState((previous) =>
        previous.status === "authenticated"
          ? {
              ...previous,
              lastErrorCode: "UNKNOWN_AUTH_ERROR",
            }
          : {
              status: "unavailable",
              user: null,
              session: null,
              lastErrorCode: "UNKNOWN_AUTH_ERROR",
            },
      );
      return false;
    }
  }, []);

  const refresh = useCallback((): Promise<boolean> => {
    const existing = refreshInFlightRef.current;
    if (existing) return existing;

    const operation = performRefresh().finally(() => {
      if (refreshInFlightRef.current === operation) {
        refreshInFlightRef.current = null;
      }
    });
    refreshInFlightRef.current = operation;
    return operation;
  }, [performRefresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const maybeRevalidate = () => {
      if (document.visibilityState !== "visible") return;
      if (
        Date.now() - lastValidatedAtRef.current <
        FOREGROUND_REVALIDATE_AFTER_MS
      ) {
        return;
      }

      void refresh();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        maybeRevalidate();
      }
    };

    window.addEventListener("focus", maybeRevalidate);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", maybeRevalidate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  useEffect(
    () =>
      subscribeAuthAuthorityChanged(() => {
        lastValidatedAtRef.current = 0;
        void refresh();
      }),
    [refresh],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const generation = ++generationRef.current;

      try {
        const snapshot = await authApi.login(email, password);

        if (generation !== generationRef.current) {
          return;
        }

        lastValidatedAtRef.current = Date.now();
        setState({
          status: "authenticated",
          user: snapshot.user,
          session: snapshot.session,
          lastErrorCode: null,
        });
        publishAuthAuthorityChanged();
      } catch (error) {
        if (generation !== generationRef.current) {
          return;
        }

        if (isAuthApiError(error) && error.code === "ACCOUNT_RESTRICTED") {
          setState({
            status: "restricted",
            user: null,
            session: null,
            lastErrorCode: error.code,
          });
        } else {
          setState((previous) => ({
            ...previous,
            status:
              previous.status === "authenticated"
                ? "authenticated"
                : "anonymous",
            lastErrorCode: isAuthApiError(error)
              ? error.code
              : "UNKNOWN_AUTH_ERROR",
          }));
        }

        throw error;
      }
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    const generation = ++generationRef.current;

    try {
      await authApi.logout();

      if (generation !== generationRef.current) {
        return;
      }

      lastValidatedAtRef.current = Date.now();
      setState({
        status: "anonymous",
        user: null,
        session: null,
        lastErrorCode: null,
      });
      publishAuthAuthorityChanged();
    } catch (error) {
      if (generation !== generationRef.current) {
        return;
      }

      setState((previous) => ({
        ...previous,
        lastErrorCode: isAuthApiError(error)
          ? error.code
          : "UNKNOWN_AUTH_ERROR",
      }));

      throw error;
    }
  }, []);

  const clearError = useCallback(() => {
    setState((previous) => ({
      ...previous,
      lastErrorCode: null,
    }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status: state.status,
        user: state.user,
        session: state.session,
        lastErrorCode: state.lastErrorCode,
        login,
        logout,
        refresh,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
