import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import "./Layout.scss";
import LogoutButton from "../shared/components/LogoutButton";

const Layout = () => {
  const { user } = useAuth();

  return (
    <div className="layout">
      <header className="navbar">
        <h1 className="logo">Los Apuntes</h1>
        <nav>
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? "active" : "")}
            end
          >
            Home
          </NavLink>
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
          <NavLink
            to="/dashboard"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Dashboard
          </NavLink>

          {user && <LogoutButton />}
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
