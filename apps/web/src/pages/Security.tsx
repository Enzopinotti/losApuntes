import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { AccountExportPanel } from "../features/account-export/AccountExportPanel";
import {
  authErrorMessage,
  authErrorRequestId,
} from "../features/auth/authMessages";
import { publishAuthAuthorityChanged } from "../features/auth/authAuthorityChannel";
import type {
  LoginMethods,
  PublicAuthSession,
} from "../features/auth/interfaces";
import { newPasswordValidationMessage } from "../features/auth/passwordPolicy";
import PasswordField from "../features/auth/PasswordField";
import {
  authApi,
  isAuthApiError,
} from "../features/auth/services/authService";
import { SecurityActionGate } from "../features/auth/security-action-gate";
import {
  isUncertainSessionRevocationError,
  sessionRevocationReconciliation,
} from "../features/auth/security-session-reconciliation.mjs";
import { ConfirmDialog } from "../shared/components/ConfirmDialog";
import {
  useAsyncAuthorityFence,
  type AsyncAuthorityTicket,
} from "../shared/useAsyncAuthorityFence";

const googleCallbackMessages: Record<string, string> = {
  linked: "Google quedó conectado como método para iniciar sesión.",
  already_linked: "Google ya estaba conectado a tu cuenta.",
  failed: "No pudimos completar la vinculación con Google.",
  cancelled: "Cancelaste la vinculación con Google.",
};

type Scoped<T> = { scopeKey: string; value: T };

type SecuritySnapshot = {
  sessions: PublicAuthSession[];
  sessionsTruncated: boolean;
  sessionInventoryLimit: number;
  methods: LoginMethods | null;
  googleEnabled: boolean;
};

type SecurityPresentation = {
  loading: boolean;
  busyAction: string | null;
  feedback: string | null;
  error: string | null;
  requestId: string | undefined;
};

type UncertainSessionRevocation = {
  kind: "one" | "all";
  targetId: string | null;
  currentSession: boolean;
};

type SecurityDrafts = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  googlePassword: string;
};

const initialSecurityPresentation: SecurityPresentation = {
  loading: true,
  busyAction: null,
  feedback: null,
  error: null,
  requestId: undefined,
};

const emptySecurityDrafts: SecurityDrafts = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
  googlePassword: "",
};

const Security = () => {
  const { status, user, session, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const {
    begin: beginLoad,
    isCurrent: isLoadCurrent,
    finish: finishLoad,
  } = useAsyncAuthorityFence(`security-load:${authScopeKey}`);
  const {
    begin: beginAction,
    isCurrent: isActionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(`security-action:${authScopeKey}`);
  // Prevent repeat clicks before React can render the busy state.
  const actionGateRef = useRef(new SecurityActionGate());
  // A ref additionally fences an uncertain outcome before the next render.
  const uncertainRevocationRef = useRef<
    Scoped<UncertainSessionRevocation> | null
  >(null);
  const [uncertainRevocationState, setUncertainRevocationState] = useState<
    Scoped<UncertainSessionRevocation> | null
  >(null);
  const uncertainSessionRevocation =
    uncertainRevocationState?.scopeKey === authScopeKey
      ? uncertainRevocationState.value
      : null;

  const [snapshotState, setSnapshotState] =
    useState<Scoped<SecuritySnapshot> | null>(null);
  const snapshot =
    snapshotState?.scopeKey === authScopeKey ? snapshotState.value : null;
  const sessions = snapshot?.sessions ?? [];
  const sessionsTruncated = snapshot?.sessionsTruncated ?? false;
  const sessionInventoryLimit = snapshot?.sessionInventoryLimit ?? 20;
  const methods = snapshot?.methods ?? null;
  const googleEnabled = snapshot?.googleEnabled ?? false;

  const [presentationState, setPresentationState] =
    useState<Scoped<SecurityPresentation> | null>(null);
  const presentation =
    presentationState?.scopeKey === authScopeKey
      ? presentationState.value
      : initialSecurityPresentation;
  const { loading, busyAction, feedback, error, requestId } = presentation;
  const updatePresentation = useCallback(
    (update: (current: SecurityPresentation) => SecurityPresentation) => {
      setPresentationState((current) => ({
        scopeKey: authScopeKey,
        value: update(
          current?.scopeKey === authScopeKey
            ? current.value
            : initialSecurityPresentation,
        ),
      }));
    },
    [authScopeKey],
  );

  const [draftState, setDraftState] = useState<Scoped<SecurityDrafts> | null>(
    null,
  );
  const drafts =
    draftState?.scopeKey === authScopeKey
      ? draftState.value
      : emptySecurityDrafts;
  const { currentPassword, newPassword, confirmPassword, googlePassword } =
    drafts;
  const updateDrafts = useCallback(
    (update: (current: SecurityDrafts) => SecurityDrafts) => {
      setDraftState((current) => ({
        scopeKey: authScopeKey,
        value: update(
          current?.scopeKey === authScopeKey
            ? current.value
            : emptySecurityDrafts,
        ),
      }));
    },
    [authScopeKey],
  );

  const [confirmState, setConfirmState] = useState<Scoped<boolean> | null>(
    null,
  );
  const revokeAllConfirmOpen =
    confirmState?.scopeKey === authScopeKey ? confirmState.value : false;
  const setRevokeAllConfirmOpen = (open: boolean) =>
    setConfirmState({ scopeKey: authScopeKey, value: open });
  const revokeAllButtonRef = useRef<HTMLButtonElement>(null);

  const loadSecurity = useCallback(async () => {
    const ticket = beginLoad();
    if (!isLoadCurrent(ticket)) return;
    updatePresentation((current) => ({
      ...current,
      loading: true,
      error: null,
      requestId: undefined,
    }));

    try {
      const [sessionResult, loginMethods, googleStatus] = await Promise.all([
        authApi.sessions(ticket.signal),
        authApi.loginMethods(ticket.signal),
        authApi.googleStatus(ticket.signal).catch(() => ({
          webEnabled: false,
          mobileEnabled: false,
        })),
      ]);

      if (!isLoadCurrent(ticket)) return;
      setSnapshotState({
        scopeKey: authScopeKey,
        value: {
          sessions: sessionResult.sessions,
          sessionsTruncated: sessionResult.truncated,
          sessionInventoryLimit: sessionResult.limit,
          methods: loginMethods,
          googleEnabled: googleStatus.webEnabled,
        },
      });
    } catch (nextError) {
      if (!isLoadCurrent(ticket)) return;
      updatePresentation((current) => ({
        ...current,
        error: authErrorMessage(
          nextError,
          "No pudimos cargar la configuración de seguridad.",
        ),
        requestId: authErrorRequestId(nextError),
      }));
    } finally {
      if (finishLoad(ticket)) {
        updatePresentation((current) => ({ ...current, loading: false }));
      }
    }
  }, [authScopeKey, beginLoad, finishLoad, isLoadCurrent, updatePresentation]);
  const loadRef = useRef(loadSecurity);
  loadRef.current = loadSecurity;

  useEffect(() => {
    setSnapshotState(null);
    setPresentationState({
      scopeKey: authScopeKey,
      value: initialSecurityPresentation,
    });
    setDraftState({ scopeKey: authScopeKey, value: emptySecurityDrafts });
    setConfirmState({ scopeKey: authScopeKey, value: false });
    uncertainRevocationRef.current = null;
    setUncertainRevocationState(null);
  }, [authScopeKey]);

  useEffect(() => {
    void loadSecurity();
  }, [loadSecurity]);

  useEffect(() => {
    const google = searchParams.get("google");
    if (google) {
      updatePresentation((current) => ({
        ...current,
        feedback:
          googleCallbackMessages[google] ||
          "Terminó el flujo de Google. Revisá el estado del método de acceso.",
      }));
      void loadSecurity();
    }
  }, [loadSecurity, searchParams, updatePresentation]);

  const runAction = async <T,>(
    key: string,
    operation: (signal: AbortSignal) => Promise<T>,
    complete: (result: T, ticket: AsyncAuthorityTicket) => Promise<void> | void,
    fallbackMessage: string,
  ) => {
    if (uncertainRevocationRef.current?.scopeKey === authScopeKey) return;
    const lease = actionGateRef.current.tryAcquire(authScopeKey, key);
    if (!lease) return;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) {
      actionGateRef.current.release(lease);
      return;
    }
    updatePresentation((current) => ({
      ...current,
      busyAction: key,
      error: null,
      feedback: null,
      requestId: undefined,
    }));

    try {
      const result = await operation(ticket.signal);
      if (!isActionCurrent(ticket)) return;
      await complete(result, ticket);
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      if (
        (key === "all-sessions" || key.startsWith("session:")) &&
        isUncertainSessionRevocationError(nextError)
      ) {
        const pending: Scoped<UncertainSessionRevocation> = {
          scopeKey: authScopeKey,
          value: {
            kind: key === "all-sessions" ? "all" : "one",
            targetId: key.startsWith("session:") ? key.slice(8) : null,
            currentSession:
              key.startsWith("session:") && key.slice(8) === session?.id,
          },
        };
        uncertainRevocationRef.current = pending;
        setUncertainRevocationState(pending);
        updatePresentation((current) => ({
          ...current,
          error:
            "No sabemos si el servidor cerró la sesión. Para evitar un segundo cierre accidental, verificá el estado antes de continuar.",
          requestId: authErrorRequestId(nextError),
        }));
      } else {
        updatePresentation((current) => ({
          ...current,
          error: authErrorMessage(nextError, fallbackMessage),
          requestId: authErrorRequestId(nextError),
        }));
      }
    } finally {
      actionGateRef.current.release(lease);
      if (finishAction(ticket)) {
        updatePresentation((current) => ({ ...current, busyAction: null }));
      }
    }
  };

  // Only a user-triggered fresh inventory can settle an ambiguous DELETE.
  // Never retry a sensitive revocation automatically.
  const verifyUncertainRevocation = async () => {
    const pending = uncertainRevocationRef.current;
    if (!pending || pending.scopeKey !== authScopeKey) return;
    const lease = actionGateRef.current.tryAcquire(
      authScopeKey,
      "verify-revocation",
    );
    if (!lease) return;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) {
      actionGateRef.current.release(lease);
      return;
    }
    updatePresentation((current) => ({
      ...current,
      busyAction: "verify-revocation",
      error: null,
      feedback: null,
      requestId: undefined,
    }));

    try {
      const result = await authApi.sessions(ticket.signal);
      if (!isActionCurrent(ticket)) return;
      setSnapshotState((current) =>
        current?.scopeKey === authScopeKey
          ? {
              scopeKey: authScopeKey,
              value: {
                ...current.value,
                sessions: result.sessions,
                sessionsTruncated: result.truncated,
                sessionInventoryLimit: result.limit,
              },
            }
          : current,
      );

      const outcome =
        pending.value.kind === "one" && pending.value.targetId
          ? sessionRevocationReconciliation(pending.value.targetId, result)
          : "unknown";
      if (
        pending.value.kind === "one" &&
        (outcome === "unknown" ||
          (outcome === "revoked" && pending.value.currentSession))
      ) {
        updatePresentation((current) => ({
          ...current,
          error:
            "La lista de sesiones no permite confirmar el cierre. Si está incompleta, revisá tus otros dispositivos o consultá soporte antes de repetir la acción.",
        }));
        return;
      }

      // Active = definitely still listed; revoked = absent from a complete
      // inventory. Neither path resends a DELETE.
      uncertainRevocationRef.current = null;
      setUncertainRevocationState(null);
      updatePresentation((current) => ({
        ...current,
        feedback:
          pending.value.kind === "all"
            ? "Tu sesión actual sigue activa. No pudimos confirmar el cierre global; podés intentarlo de nuevo manualmente si lo necesitás."
            : outcome === "active"
              ? "La sesión continúa activa. Podés volver a intentar el cierre manualmente."
              : "Verificamos con el servidor que esa sesión ya no está activa.",
      }));
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      if (
        isAuthApiError(nextError) &&
        (nextError.status === 401 || nextError.status === 403)
      ) {
        uncertainRevocationRef.current = null;
        setUncertainRevocationState(null);
        publishAuthAuthorityChanged();
        navigate("/login", { replace: true });
        void refresh();
        return;
      }
      updatePresentation((current) => ({
        ...current,
        error:
          "No pudimos verificar las sesiones. El resultado sigue siendo incierto y no repetimos la revocación.",
        requestId: authErrorRequestId(nextError),
      }));
    } finally {
      actionGateRef.current.release(lease);
      if (finishAction(ticket)) {
        updatePresentation((current) => ({ ...current, busyAction: null }));
      }
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const passwordValidation = newPasswordValidationMessage(newPassword);
    if (passwordValidation !== true) {
      updatePresentation((current) => ({
        ...current,
        error: passwordValidation,
        feedback: null,
        requestId: undefined,
      }));
      return;
    }

    if (newPassword !== confirmPassword) {
      updatePresentation((current) => ({
        ...current,
        error: "Las contraseñas nuevas no coinciden.",
        feedback: null,
        requestId: undefined,
      }));
      return;
    }

    await runAction(
      "password",
      (signal) => authApi.changePassword(currentPassword, newPassword, signal),
      async (_result, ticket) => {
        if (!isActionCurrent(ticket)) return;
        updateDrafts(() => emptySecurityDrafts);
        publishAuthAuthorityChanged();
        navigate("/login?password=changed", { replace: true });
        void refresh();
      },
      "No pudimos cambiar la contraseña.",
    );
  };

  const revokeSession = async (target: PublicAuthSession) => {
    await runAction(
      `session:${target.id}`,
      (signal) => authApi.revokeSession(target.id, signal),
      async (_result, ticket) => {
        if (target.current || target.id === session?.id) {
          if (!isActionCurrent(ticket)) return;
          publishAuthAuthorityChanged();
          navigate("/login", { replace: true });
          void refresh();
          return;
        }

        await loadRef.current();
        if (!isActionCurrent(ticket)) return;
        updatePresentation((current) => ({
          ...current,
          feedback: "Sesión cerrada.",
        }));
      },
      "No pudimos cerrar esa sesión.",
    );
  };

  const revokeAll = async () => {
    await runAction(
      "all-sessions",
      (signal) => authApi.revokeAllSessions(signal),
      async (_result, ticket) => {
        if (!isActionCurrent(ticket)) return;
        publishAuthAuthorityChanged();
        navigate("/login", { replace: true });
        void refresh();
      },
      "No pudimos cerrar todas las sesiones.",
    );
  };

  const connectGoogle = async () => {
    await runAction(
      "google-link",
      (signal) =>
        authApi.startGoogleLink(googlePassword, "/settings/security", signal),
      async (outcome, ticket) => {
        if (outcome.alreadyLinked) {
          await loadRef.current();
          if (!isActionCurrent(ticket)) return;
          updatePresentation((current) => ({
            ...current,
            feedback: "Google ya está conectado.",
          }));
          return;
        }

        if (!outcome.authorizationUrl) {
          throw new Error("Google link start did not return a destination");
        }

        if (isActionCurrent(ticket)) {
          window.location.assign(outcome.authorizationUrl);
        }
      },
      "No pudimos conectar Google.",
    );
  };

  const disconnectGoogle = async () => {
    await runAction(
      "google-unlink",
      (signal) => authApi.unlinkGoogle(googlePassword, signal),
      async (_result, ticket) => {
        if (!isActionCurrent(ticket)) return;
        updateDrafts((current) => ({ ...current, googlePassword: "" }));
        await loadRef.current();
        if (!isActionCurrent(ticket)) return;
        updatePresentation((current) => ({
          ...current,
          feedback: "Google ya no está conectado a tu cuenta.",
        }));
      },
      "No pudimos desconectar Google.",
    );
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

      {uncertainSessionRevocation && (
        <section aria-label="Cierre de sesión pendiente de verificación">
          <p role="status">
            No repetimos cierres automáticamente: el resultado anterior es
            incierto. Verificá el inventario de sesiones antes de continuar.
          </p>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void verifyUncertainRevocation()}
          >
            {busyAction === "verify-revocation"
              ? "Verificando sesiones…"
              : "Verificar sesiones"}
          </button>
        </section>
      )}

      <ConfirmDialog
        open={revokeAllConfirmOpen}
        title="Cerrar todas las sesiones"
        description="Se cerrará esta sesión y cualquier otra sesión activa de tu cuenta. Vas a tener que iniciar sesión de nuevo."
        confirmLabel="Cerrar todas las sesiones"
        onCancel={() => setRevokeAllConfirmOpen(false)}
        onConfirm={() => {
          if (
            !revokeAllConfirmOpen ||
            busyAction !== null ||
            uncertainSessionRevocation !== null
          )
            return;
          setRevokeAllConfirmOpen(false);
          void revokeAll();
        }}
        returnFocusRef={revokeAllButtonRef}
      />

      {loading ? (
        <p role="status">Cargando seguridad…</p>
      ) : (
        <>
          <section aria-labelledby="password-security-title">
            <h2 id="password-security-title">Contraseña</h2>

            {methods?.passwordConfigured ? (
              <form className="auth-form" onSubmit={changePassword} noValidate>
                <label htmlFor="security-current-password">
                  Contraseña actual
                </label>
                <PasswordField
                  id="security-current-password"
                  label="Contraseña actual"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  value={currentPassword}
                  disabled={busyAction !== null || uncertainSessionRevocation !== null}
                  onChange={(event) =>
                    updateDrafts((current) => ({
                      ...current,
                      currentPassword: event.target.value,
                    }))
                  }
                />

                <label htmlFor="security-new-password">Nueva contraseña</label>
                <PasswordField
                  id="security-new-password"
                  label="Nueva contraseña"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  disabled={busyAction !== null || uncertainSessionRevocation !== null}
                  onChange={(event) =>
                    updateDrafts((current) => ({
                      ...current,
                      newPassword: event.target.value,
                    }))
                  }
                />

                <label htmlFor="security-confirm-password">
                  Confirmar nueva contraseña
                </label>
                <PasswordField
                  id="security-confirm-password"
                  label="Confirmar nueva contraseña"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  disabled={busyAction !== null || uncertainSessionRevocation !== null}
                  onChange={(event) =>
                    updateDrafts((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                />

                <p>
                  Al cambiarla se cierran todas las sesiones, incluida esta.
                </p>

                <button type="submit" disabled={busyAction !== null || uncertainSessionRevocation !== null}>
                  {busyAction === "password"
                    ? "Cambiando…"
                    : "Cambiar contraseña"}
                </button>
              </form>
            ) : (
              <p>
                No hay una contraseña configurada. Podés establecer una mediante
                el flujo de <Link to="/forgot-password">recuperación</Link>.
              </p>
            )}
          </section>

          <section aria-labelledby="sessions-title">
            <h2 id="sessions-title">Sesiones activas</h2>
            <p>
              Mostramos solo información necesaria; no guardamos una ubicación
              precisa ni un fingerprint del dispositivo para esta pantalla.
            </p>

            {sessionsTruncated && (
              <p role="status">
                Mostramos hasta {sessionInventoryLimit} sesiones activas,
                incluyendo esta sesión cuando corresponde. Hay sesiones
                adicionales que siguen activas aunque no aparezcan en esta
                lista. “Cerrar todas las sesiones” también las revoca.
              </p>
            )}

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
                      disabled={busyAction !== null || uncertainSessionRevocation !== null}
                      onClick={() => void revokeSession(item)}
                    >
                      {item.current ? "Cerrar esta sesión" : "Cerrar sesión"}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              ref={revokeAllButtonRef}
              type="button"
              disabled={busyAction !== null || uncertainSessionRevocation !== null}
              onClick={() => setRevokeAllConfirmOpen(true)}
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

            {(methods?.googleConnected || googleEnabled) && (
              <>
                <label htmlFor="google-reauth-password">
                  Confirmá tu contraseña para cambiar Google
                </label>
                <PasswordField
                  id="google-reauth-password"
                  label="Contraseña para cambiar Google"
                  autoComplete="current-password"
                  maxLength={256}
                  value={googlePassword}
                  onChange={(event) =>
                    updateDrafts((current) => ({
                      ...current,
                      googlePassword: event.target.value,
                    }))
                  }
                  disabled={
                    !methods?.passwordConfigured ||
                    busyAction !== null ||
                    uncertainSessionRevocation !== null
                  }
                />

                {methods?.googleConnected ? (
                  <button
                    type="button"
                    onClick={() => void disconnectGoogle()}
                    disabled={
                      !methods.passwordConfigured ||
                      !googlePassword ||
                      busyAction !== null ||
                      uncertainSessionRevocation !== null
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
                      busyAction !== null ||
                      uncertainSessionRevocation !== null
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
            )}

            {!methods?.googleConnected && !googleEnabled && (
              <p>Google no está habilitado en este entorno.</p>
            )}
          </section>

          {import.meta.env.VITE_ACCOUNT_EXPORT_WEB_ENABLED === "true" && (
            <AccountExportPanel />
          )}
        </>
      )}
    </section>
  );
};

export default Security;
