import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type { FeedItem } from "../features/feeds/interfaces";
import type { PilotHomeResponse } from "../features/pilot/interfaces";
import {
  isPilotApiError,
  pilotApi,
} from "../features/pilot/services/pilotService";
import "./Pilot.scss";

function FeedPreview({
  title,
  items,
  moreTo,
}: {
  title: string;
  items: FeedItem[];
  moreTo: string;
}) {
  return (
    <section className="pilot-card">
      <header className="pilot-card-heading">
        <h2>{title}</h2>
        <Link to={moreTo}>Ver feed completo</Link>
      </header>
      {items.length === 0 ? (
        <p className="pilot-muted">
          Todavía no hay contenido útil para esta tanda.
        </p>
      ) : (
        <ul className="pilot-feed-preview">
          {items.map((item) => {
            const kindLabel =
              item.type === "resource"
                ? "Apunte"
                : item.type === "question"
                  ? "Pregunta"
                  : "Organización";
            const sourceLabel =
              item.source.kind === "campus_organization"
                ? item.source.organization.name
                : item.author.displayName;

            return (
              <li key={`${item.type}:${item.id}`}>
                <span>{kindLabel}</span>
                <strong>{item.title}</strong>
                <small>
                  {item.academic.subject
                    ? `${item.academic.subject.name} · ${sourceLabel}`
                    : sourceLabel}
                </small>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Landing() {
  return (
    <section className="pilot-page pilot-landing">
      <div className="pilot-landing-copy">
        <p className="pilot-eyebrow">Los Apuntes</p>
        <h1>Tu universidad, organizada alrededor de lo que estudiás.</h1>
        <p>
          Encontrá apuntes, preguntas y personas dentro de un contexto académico
          verificable, sin un feed infinito diseñado para retenerte.
        </p>
        <div className="pilot-actions">
          <Link className="pilot-primary-link" to="/sign-up">
            Crear cuenta
          </Link>
          <Link to="/search">Explorar búsqueda</Link>
          <Link to="/resources">Ver recursos públicos</Link>
        </div>
      </div>
    </section>
  );
}

const Home = () => {
  const { status } = useAuth();
  const [snapshot, setSnapshot] = useState<PilotHomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setSnapshot(await pilotApi.home());
    } catch (nextError) {
      setError(
        isPilotApiError(nextError)
          ? nextError.message
          : "No pudimos preparar tu inicio.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      void load();
    } else {
      setSnapshot(null);
    }
  }, [load, status]);

  if (status === "restoring") {
    return (
      <section className="pilot-page">
        <p role="status">Preparando Los Apuntes…</p>
      </section>
    );
  }

  if (status !== "authenticated") {
    return <Landing />;
  }

  const alumniContinuity =
    snapshot?.academic.currentSubjectIds.length === 0 &&
    (snapshot.lifecycle.phase === "alumni" ||
      snapshot.lifecycle.phase === "mixed");

  return (
    <section className="pilot-page" aria-labelledby="pilot-home-title">
      <header className="pilot-hero">
        <div>
          <p className="pilot-eyebrow">Inicio contextual</p>
          <h1 id="pilot-home-title">Qué vale la pena mirar ahora</h1>
          <p>
            Una tanda corta basada en tus materias, tu red y tus preferencias
            actuales.
          </p>
        </div>
        <div className="pilot-hero-stats">
          <span>
            <strong>{snapshot?.academic.currentSubjectIds.length ?? 0}</strong>
            materias actuales
          </span>
          <Link to="/notifications">
            <strong>{snapshot?.notifications.unreadCount ?? 0}</strong>{" "}
            notificaciones sin leer
          </Link>
        </div>
      </header>

      {error && (
        <div className="pilot-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}

      {loading && !snapshot ? (
        <p role="status">Preparando una tanda útil…</p>
      ) : snapshot ? (
        <>
          {!snapshot.profileReady && (
            <section className="pilot-callout">
              <div>
                <strong>Tu perfil todavía está incompleto.</strong>
                <p>
                  Completalo para que tu identidad y tus señales de
                  personalización sean explícitas.
                </p>
              </div>
              <Link to="/profile">Completar perfil</Link>
            </section>
          )}

          {snapshot.academic.currentSubjectIds.length === 0 &&
            !alumniContinuity && (
              <section className="pilot-callout">
                <div>
                  <strong>Falta tu contexto académico actual.</strong>
                  <p>
                    El feed no inventa materias: necesita participaciones
                    académicas reales para contextualizar el inicio.
                  </p>
                </div>
                <Link to="/search">Explorar materias y contenido</Link>
              </section>
            )}

          {alumniContinuity && (
            <section className="pilot-callout">
              <div>
                <strong>Tu etapa cambió, tu comunidad sigue.</strong>
                <p>
                  Conservamos tu historial y priorizamos universidad, carrera,
                  personas y organizaciones que elegiste seguir.
                </p>
              </div>
              <Link to="/academic/lifecycle">Revisar mi trayectoria</Link>
            </section>
          )}

          <div className="pilot-grid">
            <FeedPreview
              title={
                snapshot.homeFeed.kind === "community"
                  ? "Universidad y comunidad"
                  : "Mis materias"
              }
              items={snapshot.homeFeed.items}
              moreTo="/feeds"
            />
            <FeedPreview
              title="Para vos"
              items={snapshot.forYou.items}
              moreTo="/feeds"
            />
          </div>

          <section className="pilot-card pilot-shortcuts">
            <h2>{alumniContinuity ? "Seguir conectado" : "Seguir estudiando"}</h2>
            <div className="pilot-actions">
              <Link to="/academic/lifecycle">Mi trayectoria</Link>
              <Link to="/resources">Buscar o subir apuntes</Link>
              <Link to="/questions">Preguntar o responder</Link>
              <Link to="/network">Revisar mi red</Link>
              <Link to="/organizations">Organizaciones</Link>
              <Link to="/search">Buscar en Los Apuntes</Link>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
};

export default Home;
