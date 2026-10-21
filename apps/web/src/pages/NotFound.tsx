import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import "./NotFound.scss";

/**
 * Handles unmatched SPA routes, not domain-data 404s returned by the API.
 * Never render the original path/query/hash: shared URLs can contain
 * recovery tokens or other private data.
 */
const NotFound = () => {
  const { status } = useAuth();
  const authenticated = status === "authenticated";

  return (
    <section className="not-found-page" aria-labelledby="not-found-title">
      <div className="not-found-panel">
        <p className="not-found-code" aria-hidden="true">
          404
        </p>
        <h1 id="not-found-title">No encontramos esta página</h1>
        <p className="not-found-description">
          El enlace puede haber cambiado o tener un error. Podés volver a un
          lugar conocido sin perder el control de tu cuenta.
        </p>

        <nav className="not-found-actions" aria-label="Opciones para continuar">
          <Link className="not-found-primary" to="/">
            Ir al inicio
          </Link>
          <Link className="not-found-secondary" to="/search">
            Explorar apuntes y materias
          </Link>
          {authenticated && (
            <Link className="not-found-secondary" to="/dashboard">
              Abrir mi panel académico
            </Link>
          )}
        </nav>
        <p className="not-found-hint">
          Si buscabas un apunte o perfil concreto, probá encontrarlo mediante la
          búsqueda. No mostramos la dirección original por privacidad.
        </p>
      </div>
    </section>
  );
};

export default NotFound;
