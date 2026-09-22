import { useForm } from "react-hook-form";
import type { LoginFormData } from "../interfaces";
import "../AuthForm.scss";
import { fakeAuthApi } from "../services/authService";
import { useAuth } from "../../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const LoginForm = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({ mode: "onSubmit" });

  const onSubmit = async (data: LoginFormData) => {
    try {
      const { user, token } = await fakeAuthApi.login(
        data.email,
        data.password
      );
      login(token, user);
      navigate("/dashboard");
    } catch (error) {
      console.error(error);
      throw new Error("Error al iniciar sesión");
    }
  };

  return (
    <>
      <div className="auth-container">
        <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
          <div>
            <input
              placeholder="Email"
              type="email"
              {...register("email", {
                required: "El email es obligatorio",
                pattern: {
                  value: /^\S+@\S+$/i,
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
                  message: "La contraseña debe tener al menos 8 caracteres",
                },
              })}
            />

            {errors.password && (
              <p className="error">{errors.password.message}</p>
            )}
          </div>

          <button type="submit">Iniciar Sesión </button>
        </form>
      </div>
    </>
  );
};

export default LoginForm;
