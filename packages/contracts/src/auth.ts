export const AUTH_CLIENT_TYPES = ['web', 'mobile'] as const;
export type AuthClientType = (typeof AUTH_CLIENT_TYPES)[number];

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

export interface AuthSession {
  id: string;
  clientType: AuthClientType;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AuthenticatedSessionResponse {
  user: AuthUser;
  session: AuthSession;
}

export interface MobileAuthenticatedSessionResponse
  extends AuthenticatedSessionResponse {
  sessionToken: string;
}

export interface AuthSessionListResponse {
  sessions: AuthSession[];
}

export interface AcceptedResponse {
  accepted: true;
}

export interface GoogleAvailabilityResponse {
  enabled: boolean;
}

export interface LoginMethodsResponse {
  password: boolean;
  google: boolean;
}

export interface AuthApiErrorBody {
  code?: string;
  message?: string | string[];
  statusCode?: number;
}

export interface PasswordLoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
}

export interface EmailActionRequestInput {
  email: string;
}

export interface ActionTokenInput {
  token: string;
}

export interface PasswordRecoveryCompleteInput extends ActionTokenInput {
  newPassword: string;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

export interface GoogleMobileInput {
  idToken: string;
}

export interface GoogleMobileLinkInput extends GoogleMobileInput {
  currentPassword: string;
}

export interface GoogleUnlinkInput {
  currentPassword: string;
}

export const AUTH_ERROR_CODES = [
  'AUTHENTICATION_REQUIRED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_RESTRICTED',
  'EMAIL_VERIFICATION_REQUIRED',
  'INVALID_CURRENT_PASSWORD',
  'PASSWORD_CHANGE_CONFLICT',
  'VERIFICATION_NOT_AVAILABLE',
  'RECOVERY_NOT_AVAILABLE',
  'GOOGLE_LINK_REQUIRED',
  'GOOGLE_IDENTITY_ALREADY_LINKED',
  'GOOGLE_AUTH_UNAVAILABLE',
  'GOOGLE_AUTH_FAILED',
  'REAUTHENTICATION_REQUIRED',
  'GOOGLE_UNLINK_WOULD_LOCK_ACCOUNT',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
