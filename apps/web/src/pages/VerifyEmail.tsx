import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { authErrorMessage, isAuthCode } from "../features/auth/authMessages";
import { authApi } from "../features/auth/services/authService";

type VerifyState = "verifying" | "success" | "unavailable" | "error";

const VerifyEmail = () => {
  const [token] = useState(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
  );
  const [state, setState] = useState<VerifyState>("verifying");
  const [message, setMessage] = useState<string | null>(null);
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

    void (async () => {
      try {
        await authApi.inspectEmailVerification(token);
        await authApi.completeEmailVerification(token);
        setState("success");
      } catch (error) {
        if (isAuthCode(error, "VERIFICATION_NOT_AVAILABLE")) {
          setState("unavailable");
          return;
        }

        setMessage(authErrorMessage(error, "No pudimos verificar el email."));
        setState("error");
      }
    })();
  }, [token]);

  return (
    <section className="auth-page" aria-labelledby="verify-email-title">
      <h1 id="verify-email-title">Verificación de email</h1>

      {state === "verifying" && (
        <p role="status" aria-live="polite">
          Verificando…
        </p>
      )}

      {state === "success" && (
        <>
          <p role="status">Email verificado correctamente.</p>
          <Link to="/login">Iniciar sesión</Link>
        </>
      )}

      {state === "unavailable" && (
        <>
          <p role="alert">Este enlace ya no está disponible.</p>
          <Link to="/verify-email/pending">Pedir uno nuevo</Link>
        </>
      )}

      {state === "error" && (
        <>
          <p role="alert">{message}</p>
          <Link to="/verify-email/pending">Volver a intentar</Link>
        </>
      )}
    </section>
  );
};

export default VerifyEmail;
