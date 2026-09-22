import { Link } from "react-router-dom";
import SignUpForm from "../features/auth/signup/SignUpForm";

const SignUp = () => {
  return (
    <div className="auth-page">
      <h1 className="auth-title">Crea una nueva cuenta</h1>
      <SignUpForm />
      <p style={{ padding: 6 }}>
        ¿Ya tenés cuenta?{" "}
        <Link to="/login" style={{ textDecoration: "none", color: "#2d6bc8" }}>
          Iniciá sesión
        </Link>
      </p>
    </div>
  );
};

export default SignUp;
