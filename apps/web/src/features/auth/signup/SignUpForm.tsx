import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { authErrorMessage, authErrorRequestId } from "../authMessages";
import type { SignUpFormData } from "../interfaces";
import { newPasswordValidationMessage } from "../passwordPolicy";
import { authApi } from "../services/authService";
import "../AuthForm.scss";

const SignUpForm = () => {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>();
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(true);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormData>({ mode: "onSubmit" });

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

  const onSubmit = async (data: SignUpFormData) => {
    setFormError(null);
    setRequestId(undefined);

    try {
      await authApi.register(data.email, data.password);
      navigate("/verify-email/pending", {
        replace: true,
        state: { email: data.email },
      });
    } catch (error) {
      setFormError(authErrorMessage(error, "No pudimos crear la cuenta."));
      setRequestId(authErrorRequestId(error));
    }
  };

  const password = watch("password");

  const continueWithGoogle = () => {
    window.location.assign(authApi.googleWebStartUrl("/login"));
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit(onSubmit)} className="auth-form" noValidate>
        <div>
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
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
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
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
          <label htmlFor="signup-password">Contraseña</label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            {...register("password", {
              required: "La contraseña es obligatoria",
              validate: newPasswordValidationMessage,
            })}
          />
          <small>
            Usá una frase de al menos 15 caracteres. Se permiten espacios y
            Unicode; no exigimos combinaciones artificiales de símbolos.
          </small>
          {errors.password && (
            <p className="error" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="signup-confirm-password">Confirmar contraseña</label>
          <input
            id="signup-confirm-password"
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword", {
              required: "Debes confirmar la contraseña",
              validate: (value) =>
                value === password || "Las contraseñas no coinciden",
            })}
          />
          {errors.confirmPassword && (
            <p className="error" role="alert">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <p>
          Tu cuenta se crea primero. Universidad, carrera y materias se
          completan después en el onboarding.
        </p>

        {formError && (
          <div role="alert" aria-live="polite">
            <p className="error">{formError}</p>
            {requestId && <small>Referencia para soporte: {requestId}</small>}
          </div>
        )}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creando cuenta…" : "Crear cuenta"}
        </button>

        {!googleLoading && googleEnabled && (
          <button type="button" onClick={continueWithGoogle}>
            Continuar con Google
          </button>
        )}
      </form>
    </div>
  );
};

export default SignUpForm;
