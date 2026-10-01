import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  AcademicSubjectOption,
  ResourceView,
  ResourceVisibility,
} from "../features/resources/interfaces";
import {
  isResourcesApiError,
  resourcesApi,
} from "../features/resources/services/resourcesService";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./Resources.scss";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function messageFor(error: unknown): string {
  if (!isResourcesApiError(error)) {
    return "No pudimos completar la operación.";
  }

  if (error.code === "EMAIL_VERIFICATION_REQUIRED") {
    return "Verificá tu email antes de subir o descargar apuntes.";
  }

  if (error.code === "RESOURCE_REVISION_CONFLICT") {
    return "El apunte cambió en otra pestaña. Recargá la lista antes de editar.";
  }

  return error.message;
}

function appendResources(
  current: ResourceView[],
  next: ResourceView[],
): ResourceView[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}

function listFrom(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const Resources = () => {
  const { status, user, session } = useAuth();
  const authScope = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const [searchParams] = useSearchParams();
  const routeQuery = searchParams.get("q") ?? "";
  const subjectIdFilter = searchParams.get("subjectId") ?? undefined;
  const authenticated = status === "authenticated";
  const [items, setItems] = useState<ResourceView[]>([]);
  const [query, setQuery] = useState(routeQuery);
  const [visibilityFilter, setVisibilityFilter] = useState<
    ResourceVisibility | ""
  >("");
  const [savedMode, setSavedMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<ResourceVisibility>("private");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [subjectOptions, setSubjectOptions] = useState<AcademicSubjectOption[]>(
    [],
  );
  const [subject, setSubject] = useState<AcademicSubjectOption | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadAbort = useRef<AbortController | null>(null);
  const uploadOperationKey = useRef<string | null>(null);
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});
  const loadScope = [
    authScope,
    savedMode ? "saved" : "search",
    query,
    visibilityFilter,
    subjectIdFilter ?? "all-subjects",
  ].join(":");
  const {
    begin: beginLoad,
    isCurrent: isLoadCurrent,
    finish: finishLoad,
  } = useAsyncAuthorityFence(`resources-load:${loadScope}`);
  const {
    begin: beginLookup,
    isCurrent: isLookupCurrent,
    finish: finishLookup,
  } = useAsyncAuthorityFence(`resources-subject-lookup:${authScope}`);
  const {
    begin: beginItemAction,
    isCurrent: isItemActionCurrent,
    finish: finishItemAction,
  } = useAsyncAuthorityFence(`resources-item-action:${authScope}`);
  const {
    begin: beginUpload,
    isCurrent: isUploadCurrent,
    finish: finishUpload,
  } = useAsyncAuthorityFence(`resources-upload:${authScope}`);

  const load = useCallback(
    async (cursor?: string, append = false) => {
      const ticket = beginLoad();
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const result =
          savedMode && authenticated
            ? await resourcesApi.saved(cursor, ticket.signal)
            : await resourcesApi.search(
                {
                  q: query.trim() || undefined,
                  visibility: visibilityFilter || undefined,
                  subjectId: subjectIdFilter,
                  cursor,
                },
                ticket.signal,
              );

        if (!isLoadCurrent(ticket)) return;
        setItems((current) =>
          append ? appendResources(current, result.items) : result.items,
        );
        setNextCursor(result.nextCursor);
      } catch (nextError) {
        if (isLoadCurrent(ticket)) {
          setError(messageFor(nextError));
        }
      } finally {
        if (finishLoad(ticket)) {
          if (append) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [
      authenticated,
      beginLoad,
      finishLoad,
      isLoadCurrent,
      loadScope,
      query,
      savedMode,
      subjectIdFilter,
      visibilityFilter,
    ],
  );

  useEffect(() => {
    setQuery(routeQuery);
  }, [routeQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    setBusyId(null);
    setFeedback(null);
    setLoading(true);
    if (!authenticated) setSavedMode(false);
    uploadAbort.current?.abort();
    uploadAbort.current = null;
    uploadOperationKey.current = null;
    setUploading(false);
    setUploadProgress(0);
  }, [authScope, authenticated]);

  useEffect(
    () => () => {
      uploadAbort.current?.abort();
    },
    [],
  );

  const searchSubjects = async () => {
    if (subjectQuery.trim().length < 2) return;

    const ticket = beginLookup();
    setError(null);

    try {
      const options = await resourcesApi.searchSubjects(
        subjectQuery.trim(),
        ticket.signal,
      );
      if (isLookupCurrent(ticket)) {
        setSubjectOptions(options);
      }
    } catch (nextError) {
      if (isLookupCurrent(ticket)) {
        setError(messageFor(nextError));
      }
    } finally {
      finishLookup(ticket);
    }
  };

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !subject) return;

    if (!SUPPORTED_TYPES.has(file.type)) {
      setError("Usá PDF, JPG, PNG o WebP.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("El archivo supera el máximo de 50 MiB.");
      return;
    }

    const ticket = beginUpload();
    const controller = new AbortController();
    const uploadSignal = AbortSignal.any([controller.signal, ticket.signal]);
    uploadAbort.current = controller;
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setFeedback(null);

    const operationKey = uploadOperationKey.current ?? crypto.randomUUID();
    uploadOperationKey.current = operationKey;

    try {
      const intent = await resourcesApi.createUploadIntent(
        file,
        operationKey,
        ticket.signal,
      );
      if (!isUploadCurrent(ticket)) return;

      await resourcesApi.uploadDirect(
        intent.upload,
        file,
        setUploadProgress,
        uploadSignal,
      );
      if (!isUploadCurrent(ticket)) return;

      await resourcesApi.finalize(intent.file.id, ticket.signal);
      if (!isUploadCurrent(ticket)) return;

      const created = await resourcesApi.create({
        assetId: intent.file.id,
        title,
        description: description.trim() || undefined,
        tags: listFrom(tags),
        subjectId: subject.id,
        visibility,
      }, ticket.signal);
      if (!isUploadCurrent(ticket)) return;

      setFile(null);
      uploadOperationKey.current = null;
      setTitle("");
      setDescription("");
      setTags("");
      setSubject(null);
      setSubjectOptions([]);
      setSubjectQuery("");
      setUploadProgress(0);
      setFeedback(`Publicado: ${created.resource.title}`);
      await load();
    } catch (nextError) {
      if (isUploadCurrent(ticket)) {
        setError(messageFor(nextError));
      }
    } finally {
      uploadAbort.current = null;
      if (finishUpload(ticket)) {
        setUploading(false);
      }
    }
  };

  const openAccess = async (
    resource: ResourceView,
    disposition: "inline" | "attachment",
  ) => {
    const target = window.open("about:blank", "_blank");
    if (target) target.opener = null;

    const ticket = beginItemAction();
    setBusyId(resource.id);
    setError(null);

    try {
      const result = await resourcesApi.access(
        resource.id,
        disposition,
        ticket.signal,
      );
      if (!isItemActionCurrent(ticket)) {
        target?.close();
        return;
      }

      if (target) {
        target.location.href = result.access.url;
      } else {
        window.location.assign(result.access.url);
      }
    } catch (nextError) {
      target?.close();
      if (isItemActionCurrent(ticket)) {
        setError(messageFor(nextError));
      }
    } finally {
      if (finishItemAction(ticket)) {
        setBusyId(null);
      }
    }
  };

  const updateVisibility = async (
    resource: ResourceView,
    next: ResourceVisibility,
  ) => {
    const ticket = beginItemAction();
    setBusyId(resource.id);
    setError(null);

    try {
      await resourcesApi.update(resource, { visibility: next });
      if (!isItemActionCurrent(ticket)) return;
      await load();
      if (isItemActionCurrent(ticket)) {
        setFeedback("Privacidad actualizada.");
      }
    } catch (nextError) {
      if (isItemActionCurrent(ticket)) {
        setError(messageFor(nextError));
      }
    } finally {
      if (finishItemAction(ticket)) {
        setBusyId(null);
      }
    }
  };

  const save = async (resource: ResourceView) => {
    const ticket = beginItemAction();
    setBusyId(resource.id);
    setError(null);

    try {
      await resourcesApi.save(resource.id);
      if (isItemActionCurrent(ticket)) {
        setFeedback("Apunte guardado.");
      }
    } catch (nextError) {
      if (isItemActionCurrent(ticket)) {
        setError(messageFor(nextError));
      }
    } finally {
      if (finishItemAction(ticket)) {
        setBusyId(null);
      }
    }
  };

  const unsave = async (resource: ResourceView) => {
    const ticket = beginItemAction();
    setBusyId(resource.id);
    setError(null);

    try {
      await resourcesApi.unsave(resource.id);
      if (!isItemActionCurrent(ticket)) return;
      setFeedback("Apunte quitado de guardados.");
      await load();
    } catch (nextError) {
      if (isItemActionCurrent(ticket)) {
        setError(messageFor(nextError));
      }
    } finally {
      if (finishItemAction(ticket)) {
        setBusyId(null);
      }
    }
  };

  const report = async (resource: ResourceView) => {
    const ticket = beginItemAction();
    setBusyId(resource.id);
    setError(null);

    try {
      await resourcesApi.report(resource.id);
      if (isItemActionCurrent(ticket)) {
        setFeedback("Reporte recibido para revisión.");
      }
    } catch (nextError) {
      if (isItemActionCurrent(ticket)) {
        setError(messageFor(nextError));
      }
    } finally {
      if (finishItemAction(ticket)) {
        setBusyId(null);
      }
    }
  };

  const share = async (resource: ResourceView, revoke = false) => {
    const profileId = shareInputs[resource.id]?.trim();
    if (!profileId) {
      setError("Ingresá el UUID público del perfil.");
      return;
    }

    const ticket = beginItemAction();
    setBusyId(resource.id);
    setError(null);

    try {
      if (revoke) {
        await resourcesApi.unshare(resource.id, profileId);
        if (isItemActionCurrent(ticket)) {
          setFeedback("Acceso compartido revocado.");
        }
      } else {
        await resourcesApi.share(resource.id, profileId);
        if (isItemActionCurrent(ticket)) {
          setFeedback("Acceso compartido otorgado.");
        }
      }
    } catch (nextError) {
      if (isItemActionCurrent(ticket)) {
        setError(messageFor(nextError));
      }
    } finally {
      if (finishItemAction(ticket)) {
        setBusyId(null);
      }
    }
  };

  return (
    <section className="resources-page">
      <header className="resources-hero">
        <div>
          <p className="resources-eyebrow">Apuntes y recursos</p>
          <h1>Encontrá material útil sin perder el contexto académico</h1>
          <p>
            Cada recurso conserva su materia canónica y su privacidad se
            revalida antes de cada descarga.
          </p>
        </div>
        {authenticated && (
          <button
            type="button"
            className="secondary"
            onClick={() => setSavedMode((current) => !current)}
          >
            {savedMode ? "Ver descubrimiento" : "Ver guardados"}
          </button>
        )}
      </header>

      {feedback && (
        <p className="resources-success" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="resources-error" role="alert">
          {error}
        </p>
      )}

      {subjectIdFilter && (
        <p className="resources-login-note">
          Filtrando por la materia seleccionada desde búsqueda.{" "}
          <Link to="/resources">Quitar filtro de materia</Link>
        </p>
      )}

      <form
        className="resources-search"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <input
          aria-label="Buscar apuntes"
          placeholder="Buscar por título, descripción o etiqueta"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={savedMode}
        />
        <select
          aria-label="Filtrar privacidad"
          value={visibilityFilter}
          onChange={(event) =>
            setVisibilityFilter(event.target.value as ResourceVisibility | "")
          }
          disabled={savedMode}
        >
          <option value="">Todas las visibles</option>
          <option value="public">Públicas</option>
          {authenticated && <option value="shared">Compartidas</option>}
          {authenticated && <option value="private">Privadas propias</option>}
        </select>
        <button type="submit" disabled={loading}>
          Buscar
        </button>
      </form>

      {authenticated ? (
        <details className="resources-publish">
          <summary>Subir un apunte</summary>
          <form onSubmit={publish} className="resources-form">
            <label>
              Archivo
              <input
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  uploadOperationKey.current = selected
                    ? crypto.randomUUID()
                    : null;
                }}
              />
              <small>PDF, JPG, PNG o WebP · máximo 50 MiB.</small>
            </label>

            <label>
              Título
              <input
                required
                minLength={2}
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <label className="resources-wide">
              Descripción
              <textarea
                rows={3}
                maxLength={3000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label>
              Etiquetas separadas por coma
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </label>

            <label>
              Privacidad
              <select
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as ResourceVisibility)
                }
              >
                <option value="private">Privado</option>
                <option value="shared">Compartido explícitamente</option>
                <option value="public">Público</option>
              </select>
            </label>

            <div className="resources-wide subject-picker">
              <label>
                Buscar materia canónica
                <div className="inline-control">
                  <input
                    minLength={2}
                    value={subjectQuery}
                    onChange={(event) => setSubjectQuery(event.target.value)}
                    placeholder="Ej. Base de Datos"
                  />
                  <button type="button" onClick={() => void searchSubjects()}>
                    Buscar materia
                  </button>
                </div>
              </label>

              {subject && (
                <p className="subject-selected">
                  Materia seleccionada: <strong>{subject.name}</strong>
                </p>
              )}

              {subjectOptions.length > 0 && (
                <ul className="subject-results">
                  {subjectOptions.map((option) => (
                    <li key={option.id}>
                      <button type="button" onClick={() => setSubject(option)}>
                        {option.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {uploading && (
              <div className="resources-wide upload-progress" role="status">
                <progress max={100} value={uploadProgress} />
                <span>{uploadProgress}%</span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    uploadOperationKey.current = null;
                    uploadAbort.current?.abort();
                  }}
                >
                  Cancelar subida
                </button>
              </div>
            )}

            <div className="resources-wide">
              <button type="submit" disabled={uploading || !file || !subject}>
                {uploading ? "Subiendo…" : "Publicar recurso"}
              </button>
            </div>
          </form>
        </details>
      ) : (
        <p className="resources-login-note">
          <Link to="/login">Iniciá sesión</Link> para subir, guardar o descargar
          recursos.
        </p>
      )}

      <section className="resources-list" aria-live="polite">
        {loading ? (
          <p>Cargando recursos…</p>
        ) : items.length === 0 ? (
          <p>No encontramos recursos con esos filtros.</p>
        ) : (
          items.map((resource) => (
            <article className="resource-card" key={resource.id}>
              <header>
                <div>
                  <span className="resource-visibility">
                    {resource.visibility}
                  </span>
                  <h2>{resource.title}</h2>
                  <p>
                    {resource.author?.displayName ?? "Usuario de Los Apuntes"} ·{" "}
                    {resource.academic.subject.name}
                  </p>
                </div>
                <span>{Math.ceil(resource.file.byteSize / 1024)} KiB</span>
              </header>

              {resource.description && <p>{resource.description}</p>}
              {resource.tags.length > 0 && (
                <div className="resource-tags">
                  {resource.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}

              <div className="resource-actions">
                {authenticated ? (
                  <>
                    <button
                      type="button"
                      disabled={busyId === resource.id}
                      onClick={() => void openAccess(resource, "inline")}
                    >
                      Vista previa
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busyId === resource.id}
                      onClick={() => void openAccess(resource, "attachment")}
                    >
                      Descargar
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busyId === resource.id}
                      onClick={() =>
                        void (savedMode ? unsave(resource) : save(resource))
                      }
                    >
                      {savedMode ? "Quitar de guardados" : "Guardar"}
                    </button>
                    {!resource.capabilities.edit && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busyId === resource.id}
                        onClick={() => void report(resource)}
                      >
                        Reportar
                      </button>
                    )}
                  </>
                ) : (
                  <Link to="/login">Iniciar sesión para abrir</Link>
                )}
              </div>

              {resource.capabilities.edit && (
                <div className="resource-owner-controls">
                  <label>
                    Privacidad
                    <select
                      value={resource.visibility}
                      disabled={busyId === resource.id}
                      onChange={(event) =>
                        void updateVisibility(
                          resource,
                          event.target.value as ResourceVisibility,
                        )
                      }
                    >
                      <option value="private">Privado</option>
                      <option value="shared">Compartido</option>
                      <option value="public">Público</option>
                    </select>
                  </label>

                  {resource.capabilities.manageShares &&
                    resource.visibility === "shared" && (
                      <div>
                        <label>
                          Profile UUID
                          <input
                            placeholder="UUID público del perfil"
                            value={shareInputs[resource.id] ?? ""}
                            onChange={(event) =>
                              setShareInputs((current) => ({
                                ...current,
                                [resource.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <div className="resource-actions">
                          <button
                            type="button"
                            onClick={() => void share(resource)}
                          >
                            Compartir
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => void share(resource, true)}
                          >
                            Revocar
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              )}
            </article>
          ))
        )}

        {nextCursor && (
          <button
            type="button"
            className="secondary"
            disabled={loadingMore}
            onClick={() => void load(nextCursor, true)}
          >
            {loadingMore ? "Cargando…" : "Cargar más"}
          </button>
        )}
      </section>
    </section>
  );
};

export default Resources;
