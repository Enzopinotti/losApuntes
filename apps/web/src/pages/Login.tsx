import { Link } from "react-router-dom";
import LoginForm from "../features/auth/login/LoginForm";

const Login = () => {
  return (
    <div className="auth-page">
      <h1 className="auth-title">Inicia sesión en tu cuenta</h1>
      <LoginForm />
      <p style={{ padding: 6 }}>
        ¿No tenés cuenta?{" "}
        <Link
          to="/sign-up"
          style={{ textDecoration: "none", color: "#2d6bc8" }}
        >
          Registrate
        </Link>
      </p>
    </div>
  );
};

export default Login;
