import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  authErrorMessage,
  authErrorRequestId,
  isAuthCode,
} from "../features/auth/authMessages";
import { newPasswordValidationMessage } from "../features/auth/passwordPolicy";
import { authApi } from "../features/auth/services/authService";

type RecoveryState =
  "checking" | "ready" | "submitting" | "success" | "unavailable" | "error";

const ResetPassword = () => {
  const [token] = useState(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
  );
  const [state, setState] = useState<RecoveryState>("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>();
  const startedRef = useRef(false);

  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);

    if (startedRef.current) {
      return;
    }

    startedRef.current = true;

    if (!token) {
      setState("unavailable");
      return;
    }

    void authApi
      .inspectPasswordRecovery(token)
      .then(() => setState("ready"))
      .catch((error) => {
        if (isAuthCode(error, "RECOVERY_NOT_AVAILABLE")) {
          setState("unavailable");
          return;
        }

        setMessage(
          authErrorMessage(
            error,
            "No pudimos validar el enlace de recuperación.",
          ),
        );
        setRequestId(authErrorRequestId(error));
        setState("error");
      });
  }, [token]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setRequestId(undefined);

    const passwordValidation = newPasswordValidationMessage(newPassword);
    if (passwordValidation !== true) {
      setMessage(passwordValidation);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    setState("submitting");

    try {
      await authApi.completePasswordRecovery(token, newPassword);
      setState("success");
    } catch (error) {
      if (isAuthCode(error, "RECOVERY_NOT_AVAILABLE")) {
        setState("unavailable");
        return;
      }

      setMessage(authErrorMessage(error, "No pudimos cambiar la contraseña."));
      setRequestId(authErrorRequestId(error));
      setState("ready");
    }
  };

  return (
    <section className="auth-page" aria-labelledby="reset-password-title">
      <h1 id="reset-password-title">Elegí una nueva contraseña</h1>

      {state === "checking" && (
        <p role="status" aria-live="polite">
          Validando enlace…
        </p>
      )}

      {(state === "ready" || state === "submitting") && (
        <form className="auth-form" onSubmit={submit} noValidate>
          <label htmlFor="reset-password">Nueva contraseña</label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />

          <label htmlFor="reset-password-confirm">Confirmar contraseña</label>
          <input
            id="reset-password-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          {message && (
            <div role="alert">
              <p className="error">{message}</p>
              {requestId && <small>Referencia para soporte: {requestId}</small>}
            </div>
          )}

          <button type="submit" disabled={state === "submitting"}>
            {state === "submitting" ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </form>
      )}

      {state === "success" && (
        <>
          <p role="status">
            Contraseña actualizada. Cerramos las sesiones anteriores.
          </p>
          <Link to="/login">Iniciar sesión de nuevo</Link>
        </>
      )}

      {state === "unavailable" && (
        <>
          <p role="alert">Este enlace ya no está disponible.</p>
          <Link to="/forgot-password">Pedir otro enlace</Link>
        </>
      )}

      {state === "error" && (
        <>
          <p role="alert">{message}</p>
          {requestId && <small>Referencia para soporte: {requestId}</small>}
          <br />
          <Link to="/forgot-password">Solicitar otro enlace</Link>
        </>
      )}
    </section>
  );
};

export default ResetPassword;
