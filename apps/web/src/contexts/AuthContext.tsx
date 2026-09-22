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
  authApi,
  isAuthApiError,
} from "../features/auth/services/authService";
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>(initialState);
  const generationRef = useRef(0);

  const refresh = useCallback(async (): Promise<boolean> => {
    const generation = ++generationRef.current;

    try {
      const snapshot = await authApi.me();

      if (generation !== generationRef.current) {
        return false;
      }

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
          setState({
            status: "restricted",
            user: null,
            session: null,
            lastErrorCode: error.code,
          });
          return false;
        }

        if (
          error.code === "AUTHENTICATION_REQUIRED" ||
          error.status === 401
        ) {
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const generation = ++generationRef.current;

      try {
        const snapshot = await authApi.login(email, password);

        if (generation !== generationRef.current) {
          return;
        }

        setState({
          status: "authenticated",
          user: snapshot.user,
          session: snapshot.session,
          lastErrorCode: null,
        });
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

      setState({
        status: "anonymous",
        user: null,
        session: null,
        lastErrorCode: null,
      });
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
