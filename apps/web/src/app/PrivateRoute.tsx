import type { JSX } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

export const PrivateRoute = ({ children }: { children: JSX.Element }) => {
  const { status, refresh } = useAuth();

  if (status === "restoring") {
    return <p role="status">Restaurando sesión…</p>;
  }

  if (status === "unavailable") {
    return (
      <section aria-labelledby="auth-unavailable-title">
        <h1 id="auth-unavailable-title">No pudimos comprobar tu sesión</h1>
        <p>
          Esto puede ser un problema de conexión. No cerramos tu sesión por una
          falla de red.
        </p>
        <button type="button" onClick={() => void refresh()}>
          Reintentar
        </button>
      </section>
    );
  }

  if (status === "restricted") {
    return <Navigate to="/account/restricted" replace />;
  }

  return status === "authenticated" ? (
    children
  ) : (
    <Navigate to="/login" replace />
  );
};
