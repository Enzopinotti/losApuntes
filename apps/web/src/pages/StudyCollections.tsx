import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type { ResourceView } from "../features/resources/interfaces";
import { resourcesApi } from "../features/resources/services/resourcesService";
import {
  studyCollectionsApi,
  type CollectionResourceItem,
  type StudyCollection,
  StudyCollectionsApiError,
} from "../features/study-collections/studyCollectionsService";
import {
  useAsyncAuthorityFence,
  type AsyncAuthorityTicket,
} from "../shared/useAsyncAuthorityFence";
import {
  isConsistentCollectionPage,
  releaseScopedCollectionAction,
  scopedCollectionCreateAttempt,
  type ScopedCollectionCreateAttempt,
} from "../features/study-collections/studyCollectionsAuthority.mjs";
import { PERSISTENT_COLLECTIONS_VISIBLE } from "../features/study-collections/persistentCollectionsFlags";
import "./StudyCollections.scss";

type CollectionList = {
  scope: string;
  items: StudyCollection[];
  nextCursor: string | null;
  busy: boolean;
  error: string | null;
};

type CollectionDetail = {
  scope: string;
  collection: StudyCollection | null;
  items: CollectionResourceItem[];
  nextCursor: string | null;
  busy: boolean;
  error: string | null;
};

type SearchState = {
  scope: string;
  items: ResourceView[];
  busy: boolean;
  error: string | null;
};

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const apiError = error as StudyCollectionsApiError;
    if (apiError.code === "STUDY_COLLECTION_REVISION_CONFLICT") {
      return "La colección cambió en otra pestaña. Recargala antes de editar.";
    }
    if (apiError.code === "STUDY_COLLECTION_CURSOR_STALE") {
      return "La colección cambió. Volvé a cargar los apuntes.";
    }
    if (
      apiError.code === "STUDY_COLLECTIONS_NOT_ENABLED" ||
      apiError.status === 503
    ) {
      return "Las colecciones sincronizadas todavía no están habilitadas.";
    }
    if (apiError.code === "STUDY_COLLECTION_FULL") {
      return "Esta colección llegó al máximo de 100 apuntes.";
    }
    if (apiError.status === 401) {
      return "Tu sesión venció. Iniciá sesión nuevamente.";
    }
    if (apiError.status === 403 || apiError.status === 404) {
      return "El contenido ya no está disponible o no tenés permiso.";
    }
    return apiError.message;
  }
  return "No pudimos completar la operación.";
}

const StudyCollections = () => {
  const { status, user, session } = useAuth();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("collection") ?? "";
  const authScope = [status, user?.id ?? "", session?.id ?? ""].join(":");
  const detailScope = `${authScope}:${selectedId}`;
  const [listState, setListState] = useState<CollectionList | null>(null);
  const [detailState, setDetailState] = useState<CollectionDetail | null>(null);
  const detailStateRef = useRef<CollectionDetail | null>(null);
  useEffect(() => {
    detailStateRef.current = detailState;
  }, [detailState]);
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [searchDraft, setSearchDraft] = useState<{
    scope: string;
    value: string;
  } | null>(null);
  const query = searchDraft?.scope === detailScope ? searchDraft.value : "";
  const setQuery = (value: string) =>
    setSearchDraft({ scope: detailScope, value });
  const [createDraft, setCreateDraft] = useState<{
    scope: string;
    title: string;
    description: string;
  } | null>(null);
  const title = createDraft?.scope === authScope ? createDraft.title : "";
  const description =
    createDraft?.scope === authScope ? createDraft.description : "";
  const setTitle = (value: string) =>
    setCreateDraft({ scope: authScope, title: value, description });
  const setDescription = (value: string) =>
    setCreateDraft({ scope: authScope, title, description: value });
  const [editingAt, setEditingAt] = useState<string | null>(null);
  const editing = editingAt === detailScope;
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [actionError, setActionError] = useState<{
    scope: string;
    message: string;
  } | null>(null);
  const [notice, setNotice] = useState<{
    scope: string;
    message: string;
  } | null>(null);
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const actionLock = useRef<{
    scope: string;
    ticket: AsyncAuthorityTicket;
  } | null>(null);
  const createAttemptRef = useRef<ScopedCollectionCreateAttempt | null>(null);

  const {
    begin: beginList,
    isCurrent: isListCurrent,
    finish: finishList,
  } = useAsyncAuthorityFence(`study-collections-list:${authScope}`);
  const {
    begin: beginDetail,
    isCurrent: isDetailCurrent,
    finish: finishDetail,
  } = useAsyncAuthorityFence(`study-collections-detail:${detailScope}`);
  const {
    begin: beginSearch,
    isCurrent: isSearchCurrent,
    finish: finishSearch,
  } = useAsyncAuthorityFence(
    `study-collections-search:${detailScope}:${query.trim()}`,
  );
  const {
    begin: beginAction,
    isCurrent: isActionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(`study-collections-action:${detailScope}`);

  const currentList = listState?.scope === authScope ? listState : null;
  const currentDetail = detailState?.scope === detailScope ? detailState : null;
  const collection = currentDetail?.collection ?? null;
  const searchScope = `${detailScope}:${query.trim()}`;
  const currentSearch = searchState?.scope === searchScope ? searchState : null;
  const busy = busyScope === detailScope;

  const loadList = useCallback(
    async (cursor?: string, append = false) => {
      if (status !== "authenticated" || !PERSISTENT_COLLECTIONS_VISIBLE) return;
      const ticket = beginList();
      if (!isListCurrent(ticket)) return;
      setListState((previous) => ({
        scope: authScope,
        items: append && previous?.scope === authScope ? previous.items : [],
        nextCursor:
          append && previous?.scope === authScope ? previous.nextCursor : null,
        busy: true,
        error: null,
      }));
      try {
        const next = await studyCollectionsApi.list(cursor, ticket.signal);
        if (!isListCurrent(ticket)) return;
        setListState((previous) => ({
          scope: authScope,
          items:
            append && previous?.scope === authScope
              ? Array.from(
                  new Map(
                    [...previous.items, ...next.items].map((item) => [
                      item.id,
                      item,
                    ]),
                  ).values(),
                )
              : next.items,
          nextCursor: next.nextCursor,
          busy: false,
          error: null,
        }));
      } catch (error) {
        if (isListCurrent(ticket)) {
          setListState((previous) => ({
            scope: authScope,
            items:
              append && previous?.scope === authScope ? previous.items : [],
            nextCursor: null,
            busy: false,
            error: errorMessage(error),
          }));
        }
      } finally {
        finishList(ticket);
      }
    },
    [status, authScope, beginList, isListCurrent, finishList],
  );

  const loadDetail = useCallback(
    async (cursor?: string, append = false) => {
      if (
        !selectedId ||
        status !== "authenticated" ||
        !PERSISTENT_COLLECTIONS_VISIBLE
      )
        return;
      const ticket = beginDetail();
      if (!isDetailCurrent(ticket)) return;
      const previousRevision =
        append && detailStateRef.current?.scope === detailScope
          ? (detailStateRef.current.collection?.revision ?? null)
          : null;
      setDetailState((previous) => ({
        scope: detailScope,
        collection:
          previous?.scope === detailScope ? previous.collection : null,
        items: append && previous?.scope === detailScope ? previous.items : [],
        nextCursor:
          append && previous?.scope === detailScope
            ? previous.nextCursor
            : null,
        busy: true,
        error: null,
      }));
      try {
        const [header, page] = await Promise.all([
          studyCollectionsApi.get(selectedId, ticket.signal),
          studyCollectionsApi.resources(selectedId, cursor, ticket.signal),
        ]);
        if (!isDetailCurrent(ticket)) return;
        if (
          !isConsistentCollectionPage(
            header.collection.revision,
            page.revision,
            previousRevision,
            append,
          )
        ) {
          throw new StudyCollectionsApiError(
            "STUDY_COLLECTION_CURSOR_STALE",
            409,
            "La colección cambió durante la consulta.",
          );
        }
        setDetailState((previous) => ({
          scope: detailScope,
          collection: header.collection,
          items:
            append && previous?.scope === detailScope
              ? Array.from(
                  new Map(
                    [...previous.items, ...page.items].map((item) => [
                      item.resourceId,
                      item,
                    ]),
                  ).values(),
                )
              : page.items,
          nextCursor: page.nextCursor,
          busy: false,
          error: null,
        }));
      } catch (error) {
        if (isDetailCurrent(ticket)) {
          const stale =
            error instanceof StudyCollectionsApiError &&
            error.code === "STUDY_COLLECTION_CURSOR_STALE";
          setDetailState((previous) => ({
            scope: detailScope,
            collection: stale
              ? null
              : previous?.scope === detailScope
                ? previous.collection
                : null,
            items: stale
              ? []
              : append && previous?.scope === detailScope
                ? previous.items
                : [],
            nextCursor: null,
            busy: false,
            error: errorMessage(error),
          }));
        }
      } finally {
        finishDetail(ticket);
      }
    },
    [
      status,
      selectedId,
      detailScope,
      beginDetail,
      isDetailCurrent,
      finishDetail,
    ],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  useEffect(() => {
    setEditingAt(null);
  }, [detailScope]);

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !PERSISTENT_COLLECTIONS_VISIBLE ||
      !selectedId ||
      query.trim().length < 2
    )
      return;
    const ticket = beginSearch();
    if (!isSearchCurrent(ticket)) return;
    setSearchState({ scope: searchScope, items: [], busy: true, error: null });
    void resourcesApi
      .search({ q: query.trim() }, ticket.signal)
      .then(
        (result) => {
          if (isSearchCurrent(ticket)) {
            setSearchState({
              scope: searchScope,
              items: result.items,
              busy: false,
              error: null,
            });
          }
        },
        (error: unknown) => {
          if (isSearchCurrent(ticket)) {
            setSearchState({
              scope: searchScope,
              items: [],
              busy: false,
              error: errorMessage(error),
            });
          }
        },
      )
      .finally(() => {
        finishSearch(ticket);
      });
  }, [
    status,
    selectedId,
    query,
    searchScope,
    beginSearch,
    isSearchCurrent,
    finishSearch,
  ]);

  const execute = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (
      status !== "authenticated" ||
      !PERSISTENT_COLLECTIONS_VISIBLE ||
      actionLock.current?.scope === detailScope
    ) {
      return;
    }
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    const lease = { scope: detailScope, ticket };
    actionLock.current = lease;
    setBusyScope(detailScope);
    setActionError(null);
    setNotice(null);
    try {
      await work(ticket.signal);
    } catch (error) {
      if (isActionCurrent(ticket)) {
        setActionError({ scope: detailScope, message: errorMessage(error) });
      }
    } finally {
      if (finishAction(ticket)) setBusyScope(null);
      actionLock.current = releaseScopedCollectionAction(
        actionLock.current,
        lease,
      );
    }
  };

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    const attempt = scopedCollectionCreateAttempt(
      createAttemptRef.current,
      authScope,
      title,
      description,
      () => crypto.randomUUID(),
    );
    createAttemptRef.current = attempt;
    void execute(async (signal) => {
      const response = await studyCollectionsApi.create(
        { operationKey: attempt.key, title, description },
        signal,
      );
      if (signal.aborted) return;
      if (createAttemptRef.current === attempt) createAttemptRef.current = null;
      setTitle("");
      setDescription("");
      setParams({ collection: response.collection.id });
      setNotice({
        scope: `${authScope}:${response.collection.id}`,
        message: "Colección creada.",
      });
      void loadList();
    });
  };

  const saveEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!collection) return;
    void execute(async (signal) => {
      await studyCollectionsApi.update(
        collection.id,
        {
          expectedRevision: collection.revision,
          title: editTitle,
          description: editDescription,
        },
        signal,
      );
      if (signal.aborted) return;
      setEditingAt(null);
      void loadList();
      void loadDetail();
      setNotice({ scope: detailScope, message: "Cambios guardados." });
    });
  };

  const removeCollection = () => {
    if (
      !collection ||
      !window.confirm(
        `¿Eliminar la colección "${collection.title}"? Los apuntes originales se conservan.`,
      )
    ) {
      return;
    }
    void execute(async (signal) => {
      await studyCollectionsApi.delete(collection.id, signal);
      if (signal.aborted) return;
      setParams({});
      void loadList();
    });
  };

  const addResource = (resourceId: string) => {
    if (!selectedId) return;
    void execute(async (signal) => {
      await studyCollectionsApi.add(selectedId, resourceId, signal);
      if (signal.aborted) return;
      void loadDetail();
      void loadList();
      setNotice({
        scope: detailScope,
        message: "Apunte agregado a la colección.",
      });
    });
  };

  const removeResource = (resourceId: string) => {
    if (!selectedId) return;
    void execute(async (signal) => {
      await studyCollectionsApi.remove(selectedId, resourceId, signal);
      if (signal.aborted) return;
      void loadDetail();
      void loadList();
      setNotice({
        scope: detailScope,
        message: "Apunte quitado de la colección.",
      });
    });
  };

  if (!PERSISTENT_COLLECTIONS_VISIBLE) {
    return (
      <main className="study-collections-page">
        <h1>Colecciones sincronizadas no disponibles</h1>
        <p>
          Esta función todavía no está habilitada. Podés seguir organizando tus
          apuntes con las colecciones portátiles.
        </p>
        <Link to="/study">Volver a la Mesa de estudio</Link>
      </main>
    );
  }

  return (
    <main className="study-collections-page">
      <header className="study-collections-hero">
        <p className="resources-eyebrow">Mi espacio de estudio</p>
        <h1>Colecciones de estudio</h1>
        <p>
          Armá carpetas para parciales, finales o temas. Los apuntes mantienen
          sus permisos originales; sólo vos ves tus colecciones.
        </p>
        <Link to="/resources">Explorar apuntes</Link>
      </header>

      {actionError?.scope === detailScope && (
        <p role="alert" className="resources-error">
          {actionError.message}
        </p>
      )}
      {notice?.scope === detailScope && (
        <p role="status" className="resources-success">
          {notice.message}
        </p>
      )}

      <div className="study-collections-grid">
        <section
          aria-label="Mis colecciones"
          className="study-collections-panel"
        >
          <h2>Mis colecciones</h2>
          <form onSubmit={create} className="study-collections-form">
            <label htmlFor="new-collection-title">
              Nombre de la nueva colección
            </label>
            <input
              id="new-collection-title"
              maxLength={100}
              required
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej.: Segundo parcial de Física"
            />
            <label htmlFor="new-collection-description">
              Descripción (opcional)
            </label>
            <textarea
              id="new-collection-description"
              maxLength={500}
              value={description}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
            />
            <button type="submit" disabled={busy || !title.trim()}>
              Crear colección
            </button>
          </form>
          {currentList?.error && (
            <p role="alert" className="resources-error">
              {currentList.error}
            </p>
          )}
          {currentList?.busy && <p role="status">Cargando colecciones…</p>}
          {!currentList?.busy && !currentList?.items.length && (
            <p>Creá tu primera colección para guardar material por tema.</p>
          )}
          <ul className="study-collections-list">
            {currentList?.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={
                    selectedId === item.id ? "study-collection-selected" : ""
                  }
                  aria-current={selectedId === item.id ? "page" : undefined}
                  onClick={() => setParams({ collection: item.id })}
                >
                  <strong>{item.title}</strong>
                  <small>{item.resourceCount} apuntes</small>
                </button>
              </li>
            ))}
          </ul>
          {currentList?.nextCursor && (
            <button
              className="secondary"
              disabled={currentList.busy}
              type="button"
              onClick={() =>
                void loadList(currentList.nextCursor ?? undefined, true)
              }
            >
              Mostrar más colecciones
            </button>
          )}
        </section>

        <section
          aria-label="Detalle de colección"
          className="study-collections-panel"
        >
          {!selectedId ? (
            <>
              <h2>Elegí una colección</h2>
              <p>
                Podés agregar recursos desde la búsqueda, sin descargarlos ni
                cambiar su visibilidad.
              </p>
            </>
          ) : (
            <>
              {currentDetail?.busy && <p role="status">Cargando apuntes…</p>}
              {currentDetail?.error && (
                <div role="alert" className="resources-error">
                  <p>{currentDetail.error}</p>
                  <button type="button" onClick={() => void loadDetail()}>
                    Actualizar colección
                  </button>
                </div>
              )}
              {collection && (
                <>
                  <div className="study-collections-heading">
                    <div>
                      <h2>{collection.title}</h2>
                      {collection.description && (
                        <p>{collection.description}</p>
                      )}
                      <p>{collection.resourceCount} recursos</p>
                    </div>
                    <div className="study-collections-toolbar">
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          setEditTitle(collection.title);
                          setEditDescription(collection.description ?? "");
                          setEditingAt((current) =>
                            current === detailScope ? null : detailScope,
                          );
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={removeCollection}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                  {editing && (
                    <form
                      className="study-collections-form"
                      onSubmit={saveEdit}
                    >
                      <label htmlFor="edit-collection-title">Nombre</label>
                      <input
                        id="edit-collection-title"
                        maxLength={100}
                        required
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                      />
                      <label htmlFor="edit-collection-description">
                        Descripción
                      </label>
                      <textarea
                        id="edit-collection-description"
                        maxLength={500}
                        value={editDescription}
                        onChange={(event) =>
                          setEditDescription(event.target.value)
                        }
                      />
                      <button
                        type="submit"
                        disabled={busy || !editTitle.trim()}
                      >
                        Guardar cambios
                      </button>
                    </form>
                  )}
                  <h3>Apuntes de esta colección</h3>
                  {!currentDetail?.busy && !currentDetail?.items.length && (
                    <p>Todavía no agregaste apuntes.</p>
                  )}
                  <ul className="study-collection-resources">
                    {currentDetail?.items.map((entry) => (
                      <li key={entry.resourceId}>
                        {entry.resource ? (
                          <div>
                            <Link
                              to={`/resources/${encodeURIComponent(entry.resourceId)}`}
                            >
                              {entry.resource.title}
                            </Link>
                            <small>
                              {entry.resource.academic.subject.name}
                            </small>
                          </div>
                        ) : (
                          <span>
                            Apunte no disponible: se perdió el permiso o fue
                            retirado.
                          </span>
                        )}
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => removeResource(entry.resourceId)}
                          aria-label={`Quitar apunte ${entry.resource?.title ?? "no disponible"}`}
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                  {currentDetail?.nextCursor && (
                    <button
                      className="secondary"
                      type="button"
                      disabled={currentDetail.busy}
                      onClick={() =>
                        void loadDetail(
                          currentDetail.nextCursor ?? undefined,
                          true,
                        )
                      }
                    >
                      Mostrar más apuntes
                    </button>
                  )}
                  <h3>Agregar apuntes</h3>
                  <label htmlFor="collection-resource-search">
                    Buscar por título o tema (mínimo 2 caracteres)
                  </label>
                  <input
                    id="collection-resource-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Ej.: análisis matemático"
                  />
                  {currentSearch?.busy && <p role="status">Buscando…</p>}
                  {currentSearch?.error && (
                    <p role="alert">{currentSearch.error}</p>
                  )}
                  {query.trim().length >= 2 &&
                    !currentSearch?.busy &&
                    currentSearch?.items.length === 0 &&
                    !currentSearch.error && (
                      <p>No encontramos recursos. Probá con otras palabras.</p>
                    )}
                  <ul className="study-collection-resources">
                    {currentSearch?.items.map((resource) => {
                      const included = currentDetail?.items.some(
                        (item) => item.resourceId === resource.id,
                      );
                      return (
                        <li key={resource.id}>
                          <div>
                            <Link
                              to={`/resources/${encodeURIComponent(resource.id)}`}
                            >
                              {resource.title}
                            </Link>
                            <small>{resource.academic.subject.name}</small>
                          </div>
                          <button
                            type="button"
                            disabled={busy || included}
                            onClick={() => addResource(resource.id)}
                          >
                            {included ? "Agregado" : "Agregar"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
};

export default StudyCollections;
