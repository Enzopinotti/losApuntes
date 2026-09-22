import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../contexts/useAuth";
import {
  authErrorMessage,
  authErrorRequestId,
  isAuthCode,
} from "../authMessages";
import type { LoginFormData } from "../interfaces";
import { authApi } from "../services/authService";
import "../AuthForm.scss";

const googleMessages: Record<string, string> = {
  cancelled: "Cancelaste el acceso con Google.",
  failed: "No pudimos completar el acceso con Google.",
  link_required:
    "Ese email ya pertenece a una cuenta. Iniciá sesión y vinculá Google desde Seguridad.",
  account_restricted: "La cuenta tiene el acceso restringido.",
  already_linked: "Google ya está vinculado a tu cuenta.",
};

const LoginForm = () => {
  const { login, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>();
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ mode: "onSubmit" });

  useEffect(() => {
    let active = true;

    void authApi
      .googleStatus()
      .then((status) => {
        if (active) {
          setGoogleEnabled(status.webEnabled);
        }
      })
      .catch(() => {
        if (active) {
          setGoogleEnabled(false);
        }
      })
      .finally(() => {
        if (active) {
          setGoogleLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const google = searchParams.get("google");

    if (!google) {
      return;
    }

    if (google === "success") {
      void refresh().then((authenticated) => {
        if (authenticated) {
          navigate("/dashboard", { replace: true });
        }
      });
      return;
    }

    setFormError(googleMessages[google] || "No pudimos completar el acceso con Google.");
  }, [navigate, refresh, searchParams]);

  const onSubmit = async (data: LoginFormData) => {
    setFormError(null);
    setRequestId(undefined);

    try {
      await login(data.email, data.password);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      if (isAuthCode(error, "EMAIL_VERIFICATION_REQUIRED")) {
        navigate("/verify-email/pending", {
          state: { email: data.email },
        });
        return;
      }

      if (isAuthCode(error, "ACCOUNT_RESTRICTED")) {
        navigate("/account/restricted", { replace: true });
        return;
      }

      setFormError(authErrorMessage(error, "No pudimos iniciar sesión."));
      setRequestId(authErrorRequestId(error));
    }
  };

  const continueWithGoogle = () => {
    window.location.assign(authApi.googleWebStartUrl("/login"));
  };

  return (
    <div className="auth-container">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="auth-form"
        noValidate
      >
        <div>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            {...register("email", {
              required: "El email es obligatorio",
              maxLength: {
                value: 320,
                message: "El email es demasiado largo",
              },
              pattern: {
                value: /^\S+@\S+$/i,
                message: "Email inválido",
              },
            })}
          />
          {errors.email && (
            <p className="error" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            {...register("password", {
              required: "La contraseña es obligatoria",
              maxLength: {
                value: 256,
                message: "La contraseña es demasiado larga",
              },
            })}
          />
          {errors.password && (
            <p className="error" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        {formError && (
          <div role="alert" aria-live="polite">
            <p className="error">{formError}</p>
            {requestId && (
              <small>Referencia para soporte: {requestId}</small>
            )}
          </div>
        )}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Ingresando…" : "Iniciar sesión"}
        </button>

        {!googleLoading && googleEnabled && (
          <button type="button" onClick={continueWithGoogle}>
            Continuar con Google
          </button>
        )}

        <Link to="/forgot-password">Olvidé mi contraseña</Link>
      </form>
    </div>
  );
};

export default LoginForm;
