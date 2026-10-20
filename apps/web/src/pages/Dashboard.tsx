import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  dashboardJourneyById,
  dashboardJourneys,
  type DashboardJourneyId,
} from "../features/dashboard/dashboardJourneys";
import { searchSelectionHref } from "../features/search/search-navigation.mjs";
import "./Dashboard.scss";

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeJourney, setActiveJourney] =
    useState<DashboardJourneyId>("study");
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const selectedJourney = dashboardJourneyById(activeJourney);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The same canonical validation and encoding used by /search:
    // draft text is never sent or persisted before explicit submission.
    const href = searchSelectionHref({ q: query, scope: "all" });
    if (!href) {
      setSearchError("Escribí entre 2 y 120 caracteres válidos para buscar.");
      return;
    }
    setSearchError(null);
    void navigate(href);
  };

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <header className="dashboard-hero">
        <p className="dashboard-eyebrow">Tu espacio académico</p>
        <h1 id="dashboard-title">¿Qué querés hacer hoy?</h1>
        <p>
          Elegí una tarea concreta. Los Apuntes prioriza el progreso académico,
          no una lista interminable de publicaciones.
        </p>
      </header>

      <section className="dashboard-search" aria-labelledby="dashboard-search-title">
        <div>
          <h2 id="dashboard-search-title">Encontrá algo para avanzar</h2>
          <p>
            Buscá apuntes, materias o personas. Solo se envía la búsqueda
            cuando la confirmás.
          </p>
        </div>
        <form role="search" onSubmit={submitSearch} noValidate>
          <label htmlFor="dashboard-query">¿Qué necesitás?</label>
          <div className="dashboard-search-fields">
            <input
              id="dashboard-query"
              type="search"
              autoComplete="off"
              value={query}
              maxLength={120}
              placeholder="Por ejemplo: Álgebra"
              aria-describedby={
                searchError ? "dashboard-search-error" : "dashboard-search-help"
              }
              aria-invalid={Boolean(searchError)}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchError(null);
              }}
            />
            <button type="submit">Buscar</button>
          </div>
          <p id="dashboard-search-help" className="dashboard-search-hint">
            Entre 2 y 120 caracteres; podés cambiar filtros en los resultados.
          </p>
          {searchError && (
            <p id="dashboard-search-error" className="dashboard-search-error" role="alert">
              {searchError}
            </p>
          )}
        </form>
      </section>

      <section className="dashboard-journeys" aria-labelledby="dashboard-journeys-title">
        <div className="dashboard-section-heading">
          <h2 id="dashboard-journeys-title">Elegí por dónde empezar</h2>
          <p>Cuatro caminos simples, sin métricas de actividad inventadas.</p>
        </div>
        <div className="dashboard-journey-filters" role="group" aria-label="Tipo de actividad">
          {dashboardJourneys.map((journey) => (
            <button
              key={journey.id}
              type="button"
              className={activeJourney === journey.id ? "is-active" : ""}
              aria-pressed={activeJourney === journey.id}
              onClick={() => setActiveJourney(journey.id)}
            >
              {journey.title}
            </button>
          ))}
        </div>
        <div className="dashboard-journey-detail" aria-labelledby="dashboard-journey-title">
          <h3 id="dashboard-journey-title">{selectedJourney.title}</h3>
          <p>{selectedJourney.description}</p>
          <ul className="dashboard-action-grid">
            {selectedJourney.actions.map((action) => (
              <li key={action.id} className="dashboard-action-card">
                <h4>{action.label}</h4>
                <p>{action.description}</p>
                <Link to={action.href} aria-label={action.label}>
                  Abrir <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <aside className="dashboard-footer" aria-label="Orientación">
        <p>
          Tus permisos y el contenido disponible se comprueban en cada destino.
          Este panel no guarda actividad, notas ni datos de otras personas.
        </p>
        <Link to="/">Volver al inicio contextual</Link>
      </aside>
    </section>
  );
};

export default Dashboard;
