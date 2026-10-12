import { useId, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import LogoutButton from "../shared/components/LogoutButton";
import "./Layout.scss";

type NavigationDestination = {
  to: string;
  label: string;
};

const publicNavigation: NavigationDestination[] = [
  { to: "/", label: "Inicio" },
  { to: "/search", label: "Buscar" },
  { to: "/resources", label: "Apuntes" },
  { to: "/questions", label: "Preguntas" },
  { to: "/organizations", label: "Organizaciones" },
];

const memberNavigation: NavigationDestination[] = [
  { to: "/", label: "Inicio" },
  { to: "/feeds", label: "Feed" },
  { to: "/network", label: "Red" },
  { to: "/search", label: "Buscar" },
  { to: "/resources", label: "Apuntes" },
];

const memberMoreNavigation: NavigationDestination[] = [
  { to: "/questions", label: "Preguntas" },
  { to: "/organizations", label: "Organizaciones" },
  { to: "/academic/lifecycle", label: "Mi trayectoria" },
  { to: "/profile", label: "Mi perfil" },
  { to: "/dashboard", label: "Panel" },
  { to: "/settings/security", label: "Seguridad" },
];

const Layout = () => {
  const { status, user } = useAuth();
  const authenticated = status === "authenticated";
  const location = useLocation();
  const menuId = useId();
  const moreId = useId();
  const [mobileOpenedAt, setMobileOpenedAt] = useState<string | null>(null);
  const [moreOpenedAt, setMoreOpenedAt] = useState<string | null>(null);
  const scope = `${location.key}:${status}:${user?.id ?? "guest"}`;
  const mobileOpen = mobileOpenedAt === scope;
  const moreOpen = moreOpenedAt === scope;

  const closeNavigation = () => {
    setMobileOpenedAt(null);
    setMoreOpenedAt(null);
  };

  const destinations = authenticated ? memberNavigation : publicNavigation;

  return (
    <div className="layout">
      <a className="layout-skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>
      <header className="navbar">
        <div className="layout-header-inner">
          <NavLink
            to="/"
            end
            className="layout-brand"
            aria-label="Los Apuntes — ir al inicio"
            onClick={closeNavigation}
          >
            Los Apuntes
          </NavLink>

          <nav
            id={menuId}
            className={`layout-nav${mobileOpen ? " layout-nav-open" : ""}`}
            aria-label="Navegación principal"
          >
            <div className="layout-primary-links">
              {destinations.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  onClick={closeNavigation}
                >
                  {label}
                </NavLink>
              ))}
            </div>

            <div className="layout-navigation-extras">
              {authenticated ? (
                <>
                  <div className="layout-more">
                    <button
                      type="button"
                      className="layout-more-toggle"
                      aria-expanded={moreOpen}
                      aria-controls={moreId}
                      onClick={() =>
                        setMoreOpenedAt(moreOpen ? null : scope)
                      }
                    >
                      Más <span aria-hidden="true">▾</span>
                    </button>
                    {moreOpen ? (
                      <div
                        id={moreId}
                        className="layout-more-links"
                        aria-label="Otras secciones"
                      >
                        {memberMoreNavigation.map(({ to, label }) => (
                          <NavLink
                            key={to}
                            to={to}
                            onClick={closeNavigation}
                          >
                            {label}
                          </NavLink>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="layout-session-actions">
                    <span className="layout-account-email" aria-label="Cuenta actual">
                      {user?.email}
                    </span>
                    <LogoutButton />
                  </div>
                </>
              ) : (
                <div className="layout-guest-actions">
                  <NavLink to="/login" onClick={closeNavigation}>
                    Ingresar
                  </NavLink>
                  <NavLink
                    to="/sign-up"
                    className="layout-signup-link"
                    onClick={closeNavigation}
                  >
                    Registrarme
                  </NavLink>
                </div>
              )}
            </div>
          </nav>

          <div className="layout-header-actions">
            {authenticated ? (
              <NavLink
                to="/notifications"
                className="layout-notifications-link"
                aria-label="Ir a notificaciones"
                onClick={closeNavigation}
              >
                Notificaciones
              </NavLink>
            ) : null}
            <button
              type="button"
              className="layout-menu-toggle"
              aria-expanded={mobileOpen}
              aria-controls={menuId}
              onClick={() => {
                setMobileOpenedAt(mobileOpen ? null : scope);
                setMoreOpenedAt(null);
              }}
            >
              <span aria-hidden="true">{mobileOpen ? "✕" : "☰"}</span>
              <span>{mobileOpen ? "Cerrar" : "Menú"}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="contenido-principal" tabIndex={-1}>
        <Outlet />
      </main>

      <footer>
        <small>© 2026 Los Apuntes</small>
      </footer>
    </div>
  );
};

export default Layout;
