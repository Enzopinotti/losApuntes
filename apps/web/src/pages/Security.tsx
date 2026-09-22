import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import {
  authErrorMessage,
  authErrorRequestId,
} from "../features/auth/authMessages";
import type {
  LoginMethods,
  PublicAuthSession,
} from "../features/auth/interfaces";
import { authApi } from "../features/auth/services/authService";

const googleCallbackMessages: Record<string, string> = {
  linked: "Google quedó conectado como método para iniciar sesión.",
  already_linked: "Google ya estaba conectado a tu cuenta.",
  failed: "No pudimos completar la vinculación con Google.",
  cancelled: "Cancelaste la vinculación con Google.",
};

const Security = () => {
  const { session, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<PublicAuthSession[]>([]);
  const [methods, setMethods] = useState<LoginMethods | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [googlePassword, setGooglePassword] = useState("");

  const loadSecurity = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRequestId(undefined);

    try {
      const [sessionResult, loginMethods, googleStatus] = await Promise.all([
        authApi.sessions(),
        authApi.loginMethods(),
        authApi.googleStatus().catch(() => ({
          webEnabled: false,
          mobileEnabled: false,
        })),
      ]);

      setSessions(sessionResult.sessions);
      setMethods(loginMethods);
      setGoogleEnabled(googleStatus.webEnabled);
    } catch (nextError) {
      setError(
        authErrorMessage(
          nextError,
          "No pudimos cargar la configuración de seguridad.",
        ),
      );
      setRequestId(authErrorRequestId(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSecurity();
  }, [loadSecurity]);

  useEffect(() => {
    const google = searchParams.get("google");
    if (google) {
      setFeedback(
        googleCallbackMessages[google] ||
          "Terminó el flujo de Google. Revisá el estado del método de acceso.",
      );
      void loadSecurity();
    }
  }, [loadSecurity, searchParams]);

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    setRequestId(undefined);

    if (newPassword.length < 12 || newPassword.length > 256) {
      setError("La nueva contraseña debe tener entre 12 y 256 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }

    setBusyAction("password");

    try {
      await authApi.changePassword(currentPassword, newPassword);
      await refresh();
      navigate("/login?password=changed", { replace: true });
    } catch (nextError) {
      setError(
        authErrorMessage(nextError, "No pudimos cambiar la contraseña."),
      );
      setRequestId(authErrorRequestId(nextError));
    } finally {
      setBusyAction(null);
    }
  };

  const revokeSession = async (target: PublicAuthSession) => {
    setBusyAction(`session:${target.id}`);
    setError(null);
    setFeedback(null);

    try {
      await authApi.revokeSession(target.id);

      if (target.current || target.id === session?.id) {
        await refresh();
        navigate("/login", { replace: true });
        return;
      }

      await loadSecurity();
      setFeedback("Sesión cerrada.");
    } catch (nextError) {
      setError(authErrorMessage(nextError, "No pudimos cerrar esa sesión."));
      setRequestId(authErrorRequestId(nextError));
    } finally {
      setBusyAction(null);
    }
  };

  const revokeAll = async () => {
    if (!window.confirm("¿Cerrar todas las sesiones, incluida esta?")) {
      return;
    }

    setBusyAction("all-sessions");
    setError(null);
    setFeedback(null);

    try {
      await authApi.revokeAllSessions();
      await refresh();
      navigate("/login", { replace: true });
    } catch (nextError) {
      setError(
        authErrorMessage(nextError, "No pudimos cerrar todas las sesiones."),
      );
      setRequestId(authErrorRequestId(nextError));
    } finally {
      setBusyAction(null);
    }
  };

  const connectGoogle = async () => {
    setBusyAction("google-link");
    setError(null);
    setFeedback(null);

    try {
      const outcome = await authApi.startGoogleLink(
        googlePassword,
        "/settings/security",
      );

      if (outcome.alreadyLinked) {
        await loadSecurity();
        setFeedback("Google ya está conectado.");
        return;
      }

      if (!outcome.authorizationUrl) {
        throw new Error("Google link start did not return a destination");
      }

      window.location.assign(outcome.authorizationUrl);
    } catch (nextError) {
      setError(
        authErrorMessage(nextError, "No pudimos conectar Google."),
      );
      setRequestId(authErrorRequestId(nextError));
    } finally {
      setBusyAction(null);
    }
  };

  const disconnectGoogle = async () => {
    setBusyAction("google-unlink");
    setError(null);
    setFeedback(null);

    try {
      await authApi.unlinkGoogle(googlePassword);
      setGooglePassword("");
      await loadSecurity();
      setFeedback("Google ya no está conectado a tu cuenta.");
    } catch (nextError) {
      setError(
        authErrorMessage(nextError, "No pudimos desconectar Google."),
      );
      setRequestId(authErrorRequestId(nextError));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="auth-page" aria-labelledby="security-title">
      <h1 id="security-title">Seguridad de la cuenta</h1>

      {feedback && (
        <p role="status" aria-live="polite">
          {feedback}
        </p>
      )}

      {error && (
        <div role="alert">
          <p className="error">{error}</p>
          {requestId && <small>Referencia para soporte: {requestId}</small>}
        </div>
      )}

      {loading ? (
        <p role="status">Cargando seguridad…</p>
      ) : (
        <>
          <section aria-labelledby="password-security-title">
            <h2 id="password-security-title">Contraseña</h2>

            {methods?.passwordConfigured ? (
              <form className="auth-form" onSubmit={changePassword}>
                <label htmlFor="security-current-password">
                  Contraseña actual
                </label>
                <input
                  id="security-current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />

                <label htmlFor="security-new-password">
                  Nueva contraseña
                </label>
                <input
                  id="security-new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={256}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />

                <label htmlFor="security-confirm-password">
                  Confirmar nueva contraseña
                </label>
                <input
                  id="security-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={256}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />

                <p>
                  Al cambiarla se cierran todas las sesiones, incluida esta.
                </p>

                <button
                  type="submit"
                  disabled={busyAction === "password"}
                >
                  {busyAction === "password"
                    ? "Cambiando…"
                    : "Cambiar contraseña"}
                </button>
              </form>
            ) : (
              <p>
                No hay una contraseña configurada. Podés establecer una
                mediante el flujo de <Link to="/forgot-password">recuperación</Link>.
              </p>
            )}
          </section>

          <section aria-labelledby="sessions-title">
            <h2 id="sessions-title">Sesiones activas</h2>
            <p>
              Mostramos solo información necesaria; no guardamos una ubicación
              precisa ni un fingerprint del dispositivo para esta pantalla.
            </p>

            {sessions.length === 0 ? (
              <p>No hay otras sesiones activas para mostrar.</p>
            ) : (
              <ul>
                {sessions.map((item) => (
                  <li key={item.id}>
                    <strong>
                      {item.clientType === "web" ? "Web" : "Mobile"}
                      {item.current ? " · Esta sesión" : ""}
                    </strong>
                    <div>
                      Creada: {new Date(item.createdAt).toLocaleString()}
                    </div>
                    <div>
                      Última actividad:{" "}
                      {new Date(item.lastSeenAt).toLocaleString()}
                    </div>
                    <div>
                      Vence: {new Date(item.expiresAt).toLocaleString()}
                    </div>
                    <button
                      type="button"
                      disabled={busyAction === `session:${item.id}`}
                      onClick={() => void revokeSession(item)}
                    >
                      {item.current ? "Cerrar esta sesión" : "Cerrar sesión"}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              disabled={busyAction === "all-sessions"}
              onClick={() => void revokeAll()}
            >
              Cerrar todas las sesiones
            </button>
          </section>

          <section aria-labelledby="login-methods-title">
            <h2 id="login-methods-title">Métodos para iniciar sesión</h2>

            <p>
              Contraseña:{" "}
              <strong>
                {methods?.passwordConfigured ? "Configurada" : "No configurada"}
              </strong>
            </p>
            <p>
              Google:{" "}
              <strong>
                {methods?.googleConnected ? "Conectado" : "No conectado"}
              </strong>
            </p>

            {googleEnabled ? (
              <>
                <label htmlFor="google-reauth-password">
                  Confirmá tu contraseña para cambiar Google
                </label>
                <input
                  id="google-reauth-password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={256}
                  value={googlePassword}
                  onChange={(event) => setGooglePassword(event.target.value)}
                  disabled={!methods?.passwordConfigured}
                />

                {methods?.googleConnected ? (
                  <button
                    type="button"
                    onClick={() => void disconnectGoogle()}
                    disabled={
                      !methods.passwordConfigured ||
                      !googlePassword ||
                      busyAction === "google-unlink"
                    }
                  >
                    Desconectar Google
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void connectGoogle()}
                    disabled={
                      !methods?.passwordConfigured ||
                      !googlePassword ||
                      busyAction === "google-link"
                    }
                  >
                    Conectar Google
                  </button>
                )}

                {!methods?.passwordConfigured && methods?.googleConnected && (
                  <p>
                    Primero configurá una contraseña para poder desconectar tu
                    último método de acceso.
                  </p>
                )}
              </>
            ) : (
              <p>Google no está habilitado en este entorno.</p>
            )}
          </section>
        </>
      )}
    </section>
  );
};

export default Security;
