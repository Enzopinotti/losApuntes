import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  authErrorMessage,
  authErrorRequestId,
} from "../features/auth/authMessages";
import {
  acceptVerificationResend,
  canRequestVerificationAgain,
  verificationEmailKey,
  verificationResendWaitSeconds,
  type VerificationResendCooldown,
} from "../features/auth/verification-resend-safety.mjs";
import { authApi } from "../features/auth/services/authService";

type PendingLocationState = {
  email?: unknown;
};

const VerificationPending = () => {
  const location = useLocation();
  const state = location.state as PendingLocationState | null;
  const initialEmail =
    typeof state?.email === "string" && verificationEmailKey(state.email)
      ? state.email.trim()
      : "";
  const [email, setEmail] = useState(initialEmail);
  const emailRef = useRef(initialEmail);
  const inFlight = useRef(false);
  const cooldownHistory = useRef(new Map<string, VerificationResendCooldown>());
  const mounted = useRef(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(Boolean(initialEmail));
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState<VerificationResendCooldown | null>(
    null,
  );
  const [nowMs, setNowMs] = useState(() => performance.now());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Monotonic elapsed time survives tab throttling without counting ticks.
  useEffect(() => {
    if (!cooldown) return;
    const reconcile = () => {
      const now = performance.now();
      setNowMs(now);
      if (now >= cooldown.untilMs) {
        setCooldown((current) => (current === cooldown ? null : current));
      }
    };
    const timer = window.setInterval(reconcile, 1000);
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("focus", reconcile);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("focus", reconcile);
    };
  }, [cooldown]);

  const waitSeconds = verificationResendWaitSeconds(cooldown, email, nowMs);

  const onEmailChange = (next: string) => {
    emailRef.current = next;
    setEmail(next);
    const key = verificationEmailKey(next);
    const prior = key ? cooldownHistory.current.get(key) : undefined;
    setCooldown(prior && prior.untilMs > performance.now() ? prior : null);
    setSent(false);
    setError(null);
    setRequestId(undefined);
  };

  const resend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitted = emailRef.current.trim();
    const startMs = performance.now();
    if (
      !canRequestVerificationAgain(
        cooldown,
        submitted,
        startMs,
        inFlight.current,
      )
    ) {
      return;
    }

    // Synchronous ref prevents a second request before React commits state.
    inFlight.current = true;
    setSending(true);
    setError(null);
    setRequestId(undefined);

    try {
      await authApi.requestEmailVerification(submitted);
      if (!mounted.current) return;
      const acceptedAtMs = performance.now();
      const accepted = acceptVerificationResend(submitted, acceptedAtMs);
      // Keep a small, ephemeral per-address history so changing the email
      // cannot accidentally bypass the local wait for an earlier address.
      for (const [key, value] of cooldownHistory.current) {
        if (value.untilMs <= acceptedAtMs) cooldownHistory.current.delete(key);
      }
      cooldownHistory.current.delete(accepted.key);
      cooldownHistory.current.set(accepted.key, accepted);
      if (cooldownHistory.current.size > 8) {
        const oldestKey = cooldownHistory.current.keys().next().value;
        if (oldestKey) cooldownHistory.current.delete(oldestKey);
      }
      setCooldown(
        verificationEmailKey(emailRef.current) === accepted.key
          ? accepted
          : null,
      );
      setNowMs(acceptedAtMs);
      if (
        verificationEmailKey(emailRef.current) ===
        verificationEmailKey(submitted)
      ) {
        setSent(true);
      }
    } catch (nextError) {
      if (!mounted.current) return;
      if (
        verificationEmailKey(emailRef.current) ===
        verificationEmailKey(submitted)
      ) {
        setError(
          authErrorMessage(
            nextError,
            "No pudimos solicitar otro email de verificación.",
          ),
        );
        setRequestId(authErrorRequestId(nextError));
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSending(false);
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

      <form className="auth-form" onSubmit={(event) => void resend(event)}>
        <label htmlFor="verification-email">Email</label>
        <input
          id="verification-email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
          disabled={sending}
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
        />

        {error && (
          <div role="alert">
            <p className="error">{error}</p>
            {requestId && <small>Referencia para soporte: {requestId}</small>}
          </div>
        )}

        {waitSeconds > 0 && (
          <p role="status" aria-live="off" data-verification-wait>
            Podés volver a solicitar un enlace para este email en {waitSeconds}{" "}
            segundos.
          </p>
        )}

        <button
          type="submit"
          disabled={sending || waitSeconds > 0 || !verificationEmailKey(email)}
        >
          {sending ? "Enviando…" : "Reenviar email"}
        </button>
      </form>

      <p>
        La espera de esta pantalla evita envíos accidentales repetidos. Los
        límites de seguridad y los reintentos válidos los controla el servidor.
      </p>

      <p>
        <Link to="/login">Ir a iniciar sesión</Link>
        {" · "}
        <Link to="/sign-up">Usar otro email</Link>
      </p>
    </section>
  );
};

export default VerificationPending;
