import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";
import { authErrorMessage } from "../../features/auth/authMessages";

const LogoutButton = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setBusy(true);
    setError(null);

    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (nextError) {
      setError(
        authErrorMessage(
          nextError,
          "No pudimos cerrar la sesión. Reintentá cuando vuelva la conexión.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <span>
      <button type="button" onClick={() => void handleLogout()} disabled={busy}>
        {busy ? "Cerrando…" : "Cerrar sesión"}
      </button>
      {error && (
        <small className="error" role="alert">
          {error}
        </small>
      )}
    </span>
  );
};

export default LogoutButton;
