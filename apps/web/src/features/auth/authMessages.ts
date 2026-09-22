import { isAuthApiError, type AuthApiError } from "./services/authService";

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "Email o contraseña incorrectos.",
  EMAIL_VERIFICATION_REQUIRED: "Verificá tu email para continuar.",
  AUTHENTICATION_REQUIRED:
    "Tu sesión ya no está disponible. Iniciá sesión de nuevo.",
  ACCOUNT_RESTRICTED: "Tu cuenta tiene el acceso restringido.",
  INVALID_PASSWORD: "La contraseña no cumple los requisitos.",
  INVALID_CURRENT_PASSWORD: "La contraseña actual no es correcta.",
  PASSWORD_CHANGE_CONFLICT:
    "Tus credenciales cambiaron mientras procesábamos la solicitud. Iniciá sesión de nuevo.",
  VERIFICATION_NOT_AVAILABLE:
    "Este enlace de verificación ya no está disponible.",
  RECOVERY_NOT_AVAILABLE: "Este enlace de recuperación ya no está disponible.",
  RATE_LIMITED: "Hiciste varios intentos. Esperá un momento y volvé a probar.",
  GOOGLE_AUTH_UNAVAILABLE:
    "Google no está disponible en este momento. Podés usar email y contraseña.",
  GOOGLE_AUTH_FAILED:
    "No pudimos validar el acceso con Google. Volvé a intentarlo.",
  GOOGLE_LINK_REQUIRED:
    "Esa dirección ya pertenece a una cuenta. Iniciá sesión y vinculá Google desde Seguridad.",
  GOOGLE_IDENTITY_ALREADY_LINKED: "Esa cuenta de Google ya está vinculada.",
  GOOGLE_UNLINK_WOULD_LOCK_ACCOUNT:
    "Configurá otra forma de iniciar sesión antes de desconectar Google.",
  REAUTHENTICATION_REQUIRED:
    "Necesitamos que confirmes tu identidad nuevamente.",
  NETWORK_UNAVAILABLE:
    "No pudimos conectarnos. Revisá tu conexión y volvé a intentar.",
};

export function authErrorMessage(
  error: unknown,
  fallback = "No pudimos completar la operación.",
): string {
  if (!isAuthApiError(error)) {
    return fallback;
  }

  return messages[error.code] || fallback;
}

export function authErrorRequestId(error: unknown): string | undefined {
  return isAuthApiError(error) ? error.requestId : undefined;
}

export function isAuthCode(
  error: unknown,
  code: string,
): error is AuthApiError {
  return isAuthApiError(error) && error.code === code;
}
