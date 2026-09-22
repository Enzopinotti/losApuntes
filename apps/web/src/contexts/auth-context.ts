import { createContext } from "react";
import type {
  AuthStatus,
  AuthUser,
  PublicAuthSession,
} from "../features/auth/interfaces";

export type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  session: PublicAuthSession | null;
  lastErrorCode: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  clearError: () => void;
};

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
