// src/features/auth/signup/SignUpForm.tsx

import { useForm } from "react-hook-form";
import type { SignUpFormData } from "../interfaces";
import "../AuthForm.scss";
import { useAuth } from "../../../contexts/AuthContext";
import { fakeAuthApi } from "../services/authService";
import { useNavigate } from "react-router-dom";
const SignUpForm = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignUpFormData>({ mode: "onSubmit" });

  const onSubmit = async (data: SignUpFormData) => {
    try {
      const { token, user } = await fakeAuthApi.register(
        data.name,
        data.email,
        data.password,
        data.confirmPassword
      );
      login(token, user);
      navigate("/dashboard");
    } catch (error) {
      console.error(error);
      throw new Error("Error al crear cuenta");
    }
  };

  const password = watch("password");

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
        <div>
          <input
            placeholder="Nombre"
            type="text"
            {...register("name", {
              required: "El nombre es obligatorio",
              minLength: {
                value: 3,
                message: "El nombre debe contener como mínimo 3 caracteres",
              },
            })}
          />
          {errors.name && <p className="error">{errors.name.message}</p>}
        </div>

        <div>
          <input
            placeholder="Email"
            type="email"
            {...register("email", {
              required: "El email es obligatorio",
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: "Email inválido",
              },
            })}
          />
          {errors.email && <p className="error">{errors.email.message}</p>}
        </div>

        <div>
          <input
            placeholder="Contraseña"
            type="password"
            {...register("password", {
              required: "La contraseña es obligatoria",
              minLength: {
                value: 8,
                message: "La contraseña debe contener como mínimo 8 caracteres",
              },
            })}
          />
          {errors.password && (
            <p className="error">{errors.password.message}</p>
          )}
        </div>

        <div>
          <input
            placeholder="Confirmar contraseña"
            type="password"
            {...register("confirmPassword", {
              required: "Debes confirmar la contraseña",
              validate: (value) =>
                value === password || "Las contraseñas no coinciden",
            })}
          />
          {errors.confirmPassword && (
            <p className="error">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button type="submit">Registrarse</button>
      </form>
    </div>
  );
};

export default SignUpForm;
