import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import LogoutButton from "../shared/components/LogoutButton";
import "./Layout.scss";

const Layout = () => {
  const { status, user } = useAuth();
  const authenticated = status === "authenticated";

  return (
    <div className="layout">
      <header className="navbar">
        <h1 className="logo">Los Apuntes</h1>
        <nav aria-label="Navegación principal">
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? "active" : "")}
            end
          >
            Home
          </NavLink>

          <NavLink
            to="/resources"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Recursos
          </NavLink>
          <NavLink
            to="/search"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Buscar
          </NavLink>
          <NavLink
            to="/organizations"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Organizaciones
          </NavLink>
          <NavLink
            to="/questions"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Preguntas
          </NavLink>

          {!authenticated && (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Login
              </NavLink>
              <NavLink
                to="/sign-up"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Sign Up
              </NavLink>
            </>
          )}

          {authenticated && (
            <>
              <NavLink
                to="/dashboard"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Dashboard
              </NavLink>
              <NavLink
                to="/academic/lifecycle"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Trayectoria
              </NavLink>
              <NavLink
                to="/network"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Red
              </NavLink>
              <NavLink
                to="/notifications"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Notificaciones
              </NavLink>
              <NavLink
                to="/settings/security"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Seguridad
              </NavLink>
              <span aria-label="Cuenta actual">{user?.email}</span>
              <LogoutButton />
            </>
          )}
        </nav>
      </header>

      <main>
        <Outlet />
      </main>

      <footer>
        <small>© 2026 Los Apuntes</small>
      </footer>
    </div>
  );
};

export default Layout;
