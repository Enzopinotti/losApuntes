import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  authErrorMessage,
  authErrorRequestId,
} from "../features/auth/authMessages";
import { authApi } from "../features/auth/services/authService";

type PendingLocationState = {
  email?: string;
};

const VerificationPending = () => {
  const location = useLocation();
  const state = location.state as PendingLocationState | null;
  const [email, setEmail] = useState(state?.email ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(Boolean(state?.email));
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>();

  const resend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    setRequestId(undefined);

    try {
      await authApi.requestEmailVerification(email);
      setSent(true);
    } catch (nextError) {
      setError(
        authErrorMessage(
          nextError,
          "No pudimos solicitar otro email de verificación.",
        ),
      );
      setRequestId(authErrorRequestId(nextError));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="auth-page" aria-labelledby="verification-title">
      <h1 id="verification-title">Verificá tu email</h1>
      <p>
        Te enviamos un enlace para confirmar que el email es tuyo. La cuenta
        académica se completa después.
      </p>

      {sent && (
        <p role="status" aria-live="polite">
          Si podemos continuar con esa dirección, vas a recibir un email con las
          instrucciones.
        </p>
      )}

      <form className="auth-form" onSubmit={resend}>
        <label htmlFor="verification-email">Email</label>
        <input
          id="verification-email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {error && (
          <div role="alert">
            <p className="error">{error}</p>
            {requestId && <small>Referencia para soporte: {requestId}</small>}
          </div>
        )}

        <button type="submit" disabled={sending || !email.trim()}>
          {sending ? "Enviando…" : "Reenviar email"}
        </button>
      </form>

      <p>
        <Link to="/login">Ir a iniciar sesión</Link>
        {" · "}
        <Link to="/sign-up">Usar otro email</Link>
      </p>
    </section>
  );
};

export default VerificationPending;
