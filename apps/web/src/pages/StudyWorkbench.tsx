import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../contexts/useAuth";
import { StudySubjectQuestions } from "../features/study/StudySubjectQuestions";
import type { ResourceView } from "../features/resources/interfaces";
import {
  isResourcesApiError,
  resourcesApi,
} from "../features/resources/services/resourcesService";
import type { ContextualDiscoveryResponse } from "../features/search/interfaces";
import {
  isSearchApiError,
  searchApi,
} from "../features/search/services/searchService";
import {
  resolveStudySubject,
  studySubjectHref,
  studySubjectSelectionFromParams,
} from "../features/study/study-subject-navigation.mjs";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import { PERSISTENT_COLLECTIONS_VISIBLE } from "../features/study-collections/persistentCollectionsFlags";
import StudyFocusClock from "./StudyFocusClock";
import "./StudyWorkbench.scss";

type PageState<T> = {
  scope: string;
  items: T[];
  cursor: string | null;
  loading: boolean;
  error: string | null;
};

type ContextState = {
  scope: string;
  data: ContextualDiscoveryResponse | null;
  loading: boolean;
  error: string | null;
};

type ActionState = {
  scope: string;
  resourceId: string;
};

function messageFor(error: unknown): string {
  if (
    isSearchApiError(error) ||
    isResourcesApiError(error)
  ) {
    if (error.code === "RESOURCE_SAVED_SEARCH_CURSOR_STALE") {
      return "Tus guardados cambiaron en otro dispositivo. Recargá la lista.";
    }
    if (error.status === 401) {
      return "La sesión venció. Iniciá sesión nuevamente.";
    }
    if (error.status === 403) {
      return "Ya no tenés permiso para consultar o guardar este material.";
    }
    if (error.status === 404) {
      return "El material dejó de estar disponible.";
    }
    return error.message;
  }
  return "No pudimos completar la operación. Probá nuevamente.";
}

function appendDistinct<T extends { id: string }>(
  previous: T[],
  incoming: T[],
): T[] {
  return Array.from(
    new Map([...previous, ...incoming].map((item) => [item.id, item])).values(),
  );
}

export default function StudyWorkbench() {
  const { status, user, session } = useAuth();
  const [params, setParams] = useSearchParams();
  const selection = studySubjectSelectionFromParams(params);
  const authScope = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "none",
  ].join(":");

  const [contextState, setContextState] = useState<ContextState | null>(null);
  const context = contextState?.scope === authScope ? contextState : null;
  const result = context?.data
    ? resolveStudySubject(selection, context.data.subjects)
    : null;
  const activeSubject = result?.kind === "ready" ? result.subject : null;
  const subjectId = activeSubject?.id ?? null;
  const dataScope = `${authScope}:${subjectId ?? "no-subject"}`;

  const [savedState, setSavedState] = useState<PageState<ResourceView> | null>(
    null,
  );
  const [availableState, setAvailableState] =
    useState<PageState<ResourceView> | null>(null);
  const saved = savedState?.scope === dataScope ? savedState : null;
  const available = availableState?.scope === dataScope ? availableState : null;

  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    scope: string;
    text: string;
    error: boolean;
  } | null>(null);
  const currentAction = actionState?.scope === dataScope ? actionState : null;
  const currentMessage =
    actionMessage?.scope === dataScope ? actionMessage : null;
  const activeActionRef = useRef<{ scope: string; epoch: number } | null>(null);

  const {
    begin: beginContext,
    isCurrent: isContextCurrent,
    finish: finishContext,
  } = useAsyncAuthorityFence(`study-context:${authScope}`);
  const {
    begin: beginSaved,
    isCurrent: isSavedCurrent,
    finish: finishSaved,
  } = useAsyncAuthorityFence(`study-saved:${dataScope}`);
  const {
    begin: beginAvailable,
    isCurrent: isAvailableCurrent,
    finish: finishAvailable,
  } = useAsyncAuthorityFence(`study-available:${dataScope}`);
  const {
    begin: beginAction,
    isCurrent: isActionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(`study-action:${dataScope}`);

  const loadContext = useCallback(async () => {
    if (status !== "authenticated") return;
    const ticket = beginContext();
    if (!isContextCurrent(ticket)) return;
    setContextState({
      scope: authScope,
      data: null,
      loading: true,
      error: null,
    });
    try {
      const data = await searchApi.contextual(
        { subjectLimit: 8, resourcesPerSubject: 1 },
        ticket.signal,
      );
      if (isContextCurrent(ticket)) {
        setContextState({
          scope: authScope,
          data,
          loading: false,
          error: null,
        });
      }
    } catch (error) {
      if (isContextCurrent(ticket)) {
        setContextState({
          scope: authScope,
          data: null,
          loading: false,
          error: messageFor(error),
        });
      }
    } finally {
      finishContext(ticket);
    }
  }, [status, authScope, beginContext, isContextCurrent, finishContext]);

  const loadSaved = useCallback(
    async (cursor?: string, append = false) => {
      if (!subjectId) return;
      const ticket = beginSaved();
      if (!isSavedCurrent(ticket)) return;
      setSavedState((previous) => ({
        scope: dataScope,
        items: append && previous?.scope === dataScope ? previous.items : [],
        cursor:
          append && previous?.scope === dataScope ? previous.cursor : null,
        loading: true,
        error: null,
      }));
      try {
        const page = await resourcesApi.savedBySubject(
          subjectId,
          cursor,
          ticket.signal,
        );
        if (!isSavedCurrent(ticket)) return;
        setSavedState((previous) => ({
          scope: dataScope,
          items:
            append && previous?.scope === dataScope
              ? appendDistinct(previous.items, page.items)
              : page.items,
          cursor: page.nextCursor,
          loading: false,
          error: null,
        }));
      } catch (error) {
        if (isSavedCurrent(ticket)) {
          setSavedState((previous) => ({
            scope: dataScope,
            items:
              append && previous?.scope === dataScope ? previous.items : [],
            cursor: null,
            loading: false,
            error: messageFor(error),
          }));
        }
      } finally {
        finishSaved(ticket);
      }
    },
    [subjectId, dataScope, beginSaved, isSavedCurrent, finishSaved],
  );

  const loadAvailable = useCallback(
    async (cursor?: string, append = false) => {
      if (!subjectId) return;
      const ticket = beginAvailable();
      if (!isAvailableCurrent(ticket)) return;
      setAvailableState((previous) => ({
        scope: dataScope,
        items: append && previous?.scope === dataScope ? previous.items : [],
        cursor:
          append && previous?.scope === dataScope ? previous.cursor : null,
        loading: true,
        error: null,
      }));
      try {
        const page = await resourcesApi.search(
          { subjectId, cursor },
          ticket.signal,
        );
        if (!isAvailableCurrent(ticket)) return;
        setAvailableState((previous) => ({
          scope: dataScope,
          items:
            append && previous?.scope === dataScope
              ? appendDistinct(previous.items, page.items)
              : page.items,
          cursor: page.nextCursor,
          loading: false,
          error: null,
        }));
      } catch (error) {
        if (isAvailableCurrent(ticket)) {
          setAvailableState((previous) => ({
            scope: dataScope,
            items:
              append && previous?.scope === dataScope ? previous.items : [],
            cursor: null,
            loading: false,
            error: messageFor(error),
          }));
        }
      } finally {
        finishAvailable(ticket);
      }
    },
    [subjectId, dataScope, beginAvailable, isAvailableCurrent, finishAvailable],
  );

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (!subjectId) return;
    void loadSaved();
    void loadAvailable();
  }, [subjectId, loadSaved, loadAvailable]);

  const changeSubject = (subject: string) => {
    const href = studySubjectHref(subject);
    if (!href) return;
    setParams(new URLSearchParams(href.slice("/study?".length)));
  };

  const saveResource = (resourceId: string, shouldSave: boolean) => {
    if (
      activeActionRef.current?.scope === dataScope ||
      status !== "authenticated" ||
      !subjectId
    ) {
      return;
    }
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    activeActionRef.current = { scope: dataScope, epoch: ticket.epoch };
    setActionState({ scope: dataScope, resourceId });
    setActionMessage(null);
    void (async () => {
      try {
        if (shouldSave) {
          await resourcesApi.save(resourceId, ticket.signal);
        } else {
          await resourcesApi.unsave(resourceId, ticket.signal);
        }
        if (!isActionCurrent(ticket)) return;
        setActionMessage({
          scope: dataScope,
          text: shouldSave
            ? "Apunte guardado. Ya podés verlo entre tus materiales."
            : "Se quitó el apunte de Guardados.",
          error: false,
        });
        void loadSaved();
      } catch (error) {
        if (isActionCurrent(ticket)) {
          setActionMessage({
            scope: dataScope,
            text: `No pudimos confirmar el cambio: ${messageFor(error)} Recargá Guardados para comprobar el estado antes de reintentar.`,
            error: true,
          });
        }
      } finally {
        if (
          activeActionRef.current?.scope === dataScope &&
          activeActionRef.current.epoch === ticket.epoch
        ) {
          activeActionRef.current = null;
        }
        if (finishAction(ticket)) setActionState(null);
      }
    })();
  };

  const selectedSubject = activeSubject;
  const savedItems = saved?.items ?? [];
  const savedIds = new Set(savedItems.map((item) => item.id));
  const availableItems = available?.items ?? [];

  const copySubjectLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSubject) return;
    const href = studySubjectHref(selectedSubject.id);
    if (!href) return;
    try {
      await navigator.clipboard.writeText(
        new URL(href, window.location.origin).toString(),
      );
      setActionMessage({
        scope: dataScope,
        text: "Enlace copiado. La otra persona necesitará tener esta materia en su contexto.",
        error: false,
      });
    } catch {
      setActionMessage({
        scope: dataScope,
        text: "No pudimos copiar el enlace; podés copiar la URL del navegador.",
        error: true,
      });
    }
  };

  return (
    <section
      className="study-workbench"
      aria-labelledby="study-workbench-title"
    >
      <header className="study-workbench-hero">
        <div>
          <p className="study-workbench-kicker">Mi espacio académico</p>
          <h1 id="study-workbench-title">Mesa de estudio</h1>
          <p>
            Una materia, tus guardados, apuntes para descubrir y preguntas
            abiertas. Todo conectado a los permisos originales.
          </p>
        </div>
        <Link to="/resources">Ver biblioteca completa</Link>
      </header>

      {status !== "authenticated" ? (
        <p role="status">Restaurando la sesión de estudio…</p>
      ) : context?.loading || !context ? (
        <p role="status">Buscando tus materias actuales…</p>
      ) : context.error ? (
        <div className="study-workbench-alert" role="alert">
          <p>{context.error}</p>
          <button type="button" onClick={() => void loadContext()}>
            Reintentar
          </button>
        </div>
      ) : context.data && result ? (
        result.kind === "invalid" ? (
          <div className="study-workbench-alert" role="alert">
            <p>El enlace contiene un identificador de materia inválido.</p>
            <Link to="/study">Volver a mis materias</Link>
          </div>
        ) : result.kind === "unavailable" ? (
          <div className="study-workbench-alert" role="alert">
            <p>
              Esta materia no está entre las primeras ocho disponibles para esta
              vista. Revisá tu trayectoria y el contexto activo.
            </p>
            <Link to="/study">Elegir una materia actual</Link>
          </div>
        ) : result.kind === "no-context" ? (
          <div className="study-workbench-empty">
            <h2>Todavía no hay materias actuales</h2>
            <p>
              La Mesa de estudio no inventa cursadas. Cuando agregues materias
              reales a tu trayectoria, podrás ver materiales y preguntas desde
              acá.
            </p>
            <Link to="/profile">Configurar mi contexto académico</Link>
            <Link to="/search">Buscar recursos públicamente</Link>
          </div>
        ) : selectedSubject ? (
          <>
            <div className="study-workbench-subjectbar">
              <label htmlFor="study-subject">
                Materia para estudiar (hasta ocho actuales)
              </label>
              <select
                id="study-subject"
                value={selectedSubject.id}
                onChange={(event) => changeSubject(event.target.value)}
              >
                {context.data.subjects.map((bucket) => (
                  <option key={bucket.subject.id} value={bucket.subject.id}>
                    {bucket.subject.name}
                  </option>
                ))}
              </select>
              <form onSubmit={(event) => void copySubjectLink(event)}>
                <button type="submit" className="study-workbench-secondary">
                  Copiar enlace
                </button>
              </form>
            </div>
            <div className="study-workbench-actions">
              <Link
                to={`/study/session?subjectId=${encodeURIComponent(selectedSubject.id)}`}
              >
                Preparar sesión de estudio
              </Link>
              <Link
                to={`/study/practice?subjectId=${encodeURIComponent(selectedSubject.id)}`}
              >
                Practicar preguntas
              </Link>
              <Link
                to={`/study/kits?subjectId=${encodeURIComponent(selectedSubject.id)}`}
              >
                Organizar colecciones portátiles
              </Link>
              {PERSISTENT_COLLECTIONS_VISIBLE && (
                <Link to="/study-collections">
                  Mis colecciones sincronizadas
                </Link>
              )}
              <Link
                to={`/resources?subjectId=${encodeURIComponent(selectedSubject.id)}`}
              >
                Explorar más apuntes
              </Link>
              <Link to="/questions">Hacer una pregunta</Link>
              <Link to="/academic/lifecycle">Mis materias</Link>
            </div>
            <StudyFocusClock key={`${authScope}:${selectedSubject.id}`} />
            {currentMessage && (
              <p
                className={
                  currentMessage.error
                    ? "study-workbench-alert"
                    : "study-workbench-notice"
                }
                role={currentMessage.error ? "alert" : "status"}
              >
                {currentMessage.text}
              </p>
            )}
            <div className="study-workbench-columns">
              <section
                className="study-workbench-panel"
                aria-labelledby="study-saved-title"
              >
                <header>
                  <h2 id="study-saved-title">Mis guardados</h2>
                  <p>
                    Materiales que elegiste conservar, siempre sujetos a su
                    acceso actual.
                  </p>
                </header>
                {saved?.error && (
                  <p role="alert" className="study-workbench-alert">
                    {saved.error}
                  </p>
                )}
                {saved?.loading && <p role="status">Cargando guardados…</p>}
                {saved &&
                  !saved.loading &&
                  saved.items.length === 0 &&
                  !saved.error && (
                    <p>
                      No tenés guardados visibles en esta materia. Empezá
                      explorando apuntes.
                    </p>
                  )}
                <ul>
                  {savedItems.map((item) => (
                    <li key={item.id}>
                      <Link to={`/resources/${encodeURIComponent(item.id)}`}>
                        <strong>{item.title}</strong>
                      </Link>
                      <small>{item.file.filename}</small>
                      <button
                        className="study-workbench-secondary"
                        type="button"
                        disabled={Boolean(currentAction) || saved?.loading}
                        onClick={() => saveResource(item.id, false)}
                      >
                        {currentAction?.resourceId === item.id
                          ? "Actualizando…"
                          : "Quitar de guardados"}
                      </button>
                    </li>
                  ))}
                </ul>
                {saved?.cursor && (
                  <button
                    type="button"
                    className="study-workbench-secondary"
                    disabled={saved.loading}
                    onClick={() =>
                      void loadSaved(saved.cursor ?? undefined, true)
                    }
                  >
                    Mostrar más guardados
                  </button>
                )}
                <button
                  type="button"
                  className="study-workbench-secondary"
                  disabled={saved?.loading}
                  onClick={() => void loadSaved()}
                >
                  Actualizar guardados
                </button>
              </section>

              <section
                className="study-workbench-panel"
                aria-labelledby="study-discovery-title"
              >
                <header>
                  <h2 id="study-discovery-title">Apuntes disponibles</h2>
                  <p>
                    Recursos que el servidor permite descubrir ahora para{" "}
                    {selectedSubject.name}.
                  </p>
                </header>
                {available?.error && (
                  <p role="alert" className="study-workbench-alert">
                    {available.error}
                  </p>
                )}
                {available?.loading && <p role="status">Buscando apuntes…</p>}
                {available &&
                  !available.loading &&
                  available.items.length === 0 &&
                  !available.error && (
                    <p>
                      No encontramos material accesible para esta materia
                      todavía.
                    </p>
                  )}
                <ul>
                  {availableItems.map((item) => (
                    <li key={item.id}>
                      <Link to={`/resources/${encodeURIComponent(item.id)}`}>
                        <strong>{item.title}</strong>
                      </Link>
                      <small>
                        {item.author?.displayName ?? "Colaboración académica"}
                      </small>
                      {savedIds.has(item.id) ? (
                        <span className="study-workbench-saved-hint">
                          Aparece en tus guardados cargados
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={
                            Boolean(currentAction) || available?.loading
                          }
                          onClick={() => saveResource(item.id, true)}
                        >
                          {currentAction?.resourceId === item.id
                            ? "Guardando…"
                            : "Guardar apunte"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {available?.cursor && (
                  <button
                    type="button"
                    className="study-workbench-secondary"
                    disabled={available.loading}
                    onClick={() =>
                      void loadAvailable(available.cursor ?? undefined, true)
                    }
                  >
                    Más apuntes
                  </button>
                )}
                <button
                  type="button"
                  className="study-workbench-secondary"
                  disabled={available?.loading}
                  onClick={() => void loadAvailable()}
                >
                  Actualizar apuntes
                </button>
              </section>

              <StudySubjectQuestions
                key={`${authScope}:${selectedSubject.id}`}
                authScope={authScope}
                subjectId={selectedSubject.id}
                subjectName={selectedSubject.name}
              />
            </div>
            <p className="study-workbench-footnote">
              Las cantidades corresponden a los elementos de las páginas
              cargadas, no a estadísticas globales ni a una evaluación de
              rendimiento.
            </p>
          </>
        ) : null
      ) : null}
    </section>
  );
}
