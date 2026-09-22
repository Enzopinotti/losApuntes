export type LoginFormData = {
  email: string;
  password: string;
};

export type SignUpFormData = {
  email: string;
  password: string;
  confirmPassword: string;
};

export type AuthUser = {
  id: string;
  email: string;
};

export type PublicAuthSession = {
  id: string;
  clientType: "web" | "mobile";
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
};

export type AuthSnapshot = {
  user: AuthUser;
  session: PublicAuthSession;
};

export type AuthStatus =
  "restoring" | "anonymous" | "authenticated" | "restricted" | "unavailable";

export type GoogleAuthStatus = {
  webEnabled: boolean;
  mobileEnabled: boolean;
};

export type LoginMethods = {
  passwordConfigured: boolean;
  googleConnected: boolean;
};

export type ActiveSessionsResponse = {
  sessions: PublicAuthSession[];
};
