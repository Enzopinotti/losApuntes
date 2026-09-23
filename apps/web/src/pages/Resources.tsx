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

function listFrom(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const Resources = () => {
  const { status } = useAuth();
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
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (savedMode && authenticated) {
        const result = await resourcesApi.saved();
        setItems(result.items);
      } else {
        const result = await resourcesApi.search({
          q: query.trim() || undefined,
          visibility: visibilityFilter || undefined,
          subjectId: subjectIdFilter,
        });
        setItems(result.items);
      }
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setLoading(false);
    }
  }, [authenticated, query, savedMode, subjectIdFilter, visibilityFilter]);

  useEffect(() => {
    setQuery(routeQuery);
  }, [routeQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      uploadAbort.current?.abort();
    },
    [],
  );

  const searchSubjects = async () => {
    if (subjectQuery.trim().length < 2) return;

    setError(null);
    try {
      setSubjectOptions(await resourcesApi.searchSubjects(subjectQuery.trim()));
    } catch (nextError) {
      setError(messageFor(nextError));
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

    const controller = new AbortController();
    uploadAbort.current = controller;
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setFeedback(null);

    try {
      const intent = await resourcesApi.createUploadIntent(file);
      await resourcesApi.uploadDirect(
        intent.upload,
        file,
        setUploadProgress,
        controller.signal,
      );
      await resourcesApi.finalize(intent.file.id);
      const created = await resourcesApi.create({
        assetId: intent.file.id,
        title,
        description: description.trim() || undefined,
        tags: listFrom(tags),
        subjectId: subject.id,
        visibility,
      });

      setFile(null);
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
      setError(messageFor(nextError));
    } finally {
      uploadAbort.current = null;
      setUploading(false);
    }
  };

  const openAccess = async (
    resource: ResourceView,
    disposition: "inline" | "attachment",
  ) => {
    const target = window.open("about:blank", "_blank");
    if (target) target.opener = null;

    setBusyId(resource.id);
    setError(null);

    try {
      const result = await resourcesApi.access(resource.id, disposition);
      if (target) {
        target.location.href = result.access.url;
      } else {
        window.location.assign(result.access.url);
      }
    } catch (nextError) {
      target?.close();
      setError(messageFor(nextError));
    } finally {
      setBusyId(null);
    }
  };

  const updateVisibility = async (
    resource: ResourceView,
    next: ResourceVisibility,
  ) => {
    setBusyId(resource.id);
    setError(null);

    try {
      await resourcesApi.update(resource, { visibility: next });
      await load();
      setFeedback("Privacidad actualizada.");
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusyId(null);
    }
  };

  const save = async (resource: ResourceView) => {
    setBusyId(resource.id);
    setError(null);

    try {
      await resourcesApi.save(resource.id);
      setFeedback("Apunte guardado.");
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusyId(null);
    }
  };

  const unsave = async (resource: ResourceView) => {
    setBusyId(resource.id);
    setError(null);

    try {
      await resourcesApi.unsave(resource.id);
      setFeedback("Apunte quitado de guardados.");
      await load();
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusyId(null);
    }
  };

  const report = async (resource: ResourceView) => {
    setBusyId(resource.id);
    setError(null);

    try {
      await resourcesApi.report(resource.id);
      setFeedback("Reporte recibido para revisión.");
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusyId(null);
    }
  };

  const share = async (resource: ResourceView, revoke = false) => {
    const profileId = shareInputs[resource.id]?.trim();
    if (!profileId) {
      setError("Ingresá el UUID público del perfil.");
      return;
    }

    setBusyId(resource.id);
    setError(null);

    try {
      if (revoke) {
        await resourcesApi.unshare(resource.id, profileId);
        setFeedback("Acceso compartido revocado.");
      } else {
        await resourcesApi.share(resource.id, profileId);
        setFeedback("Acceso compartido otorgado.");
      }
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusyId(null);
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
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
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
                  onClick={() => uploadAbort.current?.abort()}
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
      </section>
    </section>
  );
};

export default Resources;
