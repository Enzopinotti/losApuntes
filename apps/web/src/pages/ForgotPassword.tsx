import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  authErrorMessage,
  authErrorRequestId,
} from "../features/auth/authMessages";
import { authApi } from "../features/auth/services/authService";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    setRequestId(undefined);

    try {
      await authApi.requestPasswordRecovery(email);
      setAccepted(true);
    } catch (nextError) {
      setError(
        authErrorMessage(
          nextError,
          "No pudimos solicitar la recuperación.",
        ),
      );
      setRequestId(authErrorRequestId(nextError));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="auth-page" aria-labelledby="forgot-password-title">
      <h1 id="forgot-password-title">Recuperar contraseña</h1>
      <p>
        Ingresá tu email. La respuesta es la misma exista o no una cuenta con
        esa dirección.
      </p>

      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="recovery-email">Email</label>
        <input
          id="recovery-email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {accepted && (
          <p role="status" aria-live="polite">
            Si existe una cuenta que puede recuperarse, te enviamos
            instrucciones.
          </p>
        )}

        {error && (
          <div role="alert">
            <p className="error">{error}</p>
            {requestId && <small>Referencia para soporte: {requestId}</small>}
          </div>
        )}

        <button type="submit" disabled={sending || !email.trim()}>
          {sending ? "Enviando…" : "Enviar instrucciones"}
        </button>
      </form>

      <Link to="/login">Volver a iniciar sesión</Link>
    </section>
  );
};

export default ForgotPassword;
