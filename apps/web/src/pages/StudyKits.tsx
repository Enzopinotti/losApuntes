import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../contexts/useAuth";
import type { ResourceView } from "../features/resources/interfaces";
import {
  resourcesApi,
  isResourcesApiError,
} from "../features/resources/services/resourcesService";
import type { ContextualDiscoveryResponse } from "../features/search/interfaces";
import {
  searchApi,
  isSearchApiError,
} from "../features/search/services/searchService";
import {
  addStudyKitResource,
  changeStudyKit,
  createStudyKit,
  deleteStudyKit,
  emptyStudyKitArchive,
  moveStudyKitResource,
  readStudyKitArchive,
  removeStudyKitResource,
  serializeStudyKitArchive,
  studyKitToSession,
  STUDY_KIT_MAX_COLLECTIONS,
  STUDY_KIT_MAX_RESOURCES,
  STUDY_KIT_MAX_FILE_BYTES,
  type PortableStudyKitArchive,
} from "../features/study/study-portable-kits.mjs";
import {
  loadStudyKitWorkspace,
  saveStudyKitWorkspace,
  forgetStudyKitWorkspace,
} from "../features/study/study-kit-workspace.mjs";
import { createStudyHandoff } from "../features/study/study-session-handoff.mjs";
import { StudyKitResourceSearch } from "../features/study/StudyKitResourceSearch";
import {
  resolveStudySubject,
  studySubjectHref,
  studySubjectSelectionFromParams,
} from "../features/study/study-subject-navigation.mjs";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import { studyKitCursorRepeats } from "../features/study/study-kit-source-pagination";
import { PERSISTENT_COLLECTIONS_VISIBLE } from "../features/study-collections/persistentCollectionsFlags";
import {
  studyCollectionsApi,
  StudyCollectionsApiError,
} from "../features/study-collections/studyCollectionsService";
import {
  syncStudyKitToCollection,
  StudyKitSyncError,
  type StudyKitSyncProgress,
} from "../features/study-collections/studyKitSync.mjs";
import "./StudyKits.scss";

type ScopeState<T> = {
  scope: string;
  loading: boolean;
  error: string | null;
  data: T | null;
};
type ResourcePage = {
  items: ResourceView[];
  nextCursor: string | null;
  cursorCycle: boolean;
};
type VerifiedResource = {
  resourceId: string;
  title: string | null;
};
type SelectionState = {
  scope: string;
  kitId: string | null;
};
type KitFeedback = {
  scope: string;
  text: string;
  error: boolean;
};

function errorFor(error: unknown) {
  if (isResourcesApiError(error) || isSearchApiError(error)) {
    if (error.status === 401)
      return "La sesión venció. Iniciá sesión nuevamente.";
    if (error.status === 403 || error.status === 404) {
      return "El apunte dejó de estar disponible.";
    }
    return error.message;
  }
  if (error instanceof Error && error.message.startsWith("STUDY_KIT_")) {
    return "El archivo o la colección no cumple los límites o el formato admitidos.";
  }
  return "No pudimos completar la operación. Revisá la conexión.";
}

function syncErrorFor(error: unknown): string {
  const cause = error instanceof StudyKitSyncError ? error.failure : error;
  if (cause instanceof StudyCollectionsApiError) {
    if (cause.code === "STUDY_COLLECTION_OPERATION_KEY_CONFLICT") {
      return "Ya sincronizaste este kit con otro nombre o descripción. Editá esa colección sincronizada o creá un nuevo kit.";
    }
    if (cause.status === 503) {
      return "La sincronización todavía no está habilitada por el servidor.";
    }
    if (cause.status === 401)
      return "Tu sesión venció. Volvé a iniciar sesión.";
    if (cause.status === 403 || cause.status === 404) {
      return "La cuenta, colección o referencia dejó de estar disponible.";
    }
    return cause.message;
  }
  return errorFor(cause);
}

function addDistinct(existing: ResourceView[], incoming: ResourceView[]) {
  return Array.from(
    new Map([...existing, ...incoming].map((item) => [item.id, item])).values(),
  );
}

/**
 * This projection is for current screen labels only: no stale item metadata
 * is serialized to the kit archive or to the volatile workspace.
 */
async function verifyKitResources(
  subjectId: string,
  ids: string[],
  signal: AbortSignal,
): Promise<VerifiedResource[]> {
  const output: VerifiedResource[] = new Array(ids.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (cursor < ids.length) {
      if (signal.aborted) return;
      const index = cursor++;
      const resourceId = ids[index];
      if (!resourceId) continue;
      let title: string | null = null;
      try {
        const result = await resourcesApi.get(resourceId, signal);
        if (result.resource.academic.subject.id === subjectId) {
          title = result.resource.title;
        }
      } catch (error) {
        if (signal.aborted) return;
        if (
          !isResourcesApiError(error) ||
          (error.status !== 403 && error.status !== 404)
        )
          throw error;
      }
      output[index] = { resourceId, title };
    }
  });
  await Promise.all(workers);
  if (signal.aborted) throw new Error("Request aborted");
  return output;
}

function downloadKitArchive(text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "los-apuntes-colecciones-portatiles.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StudyKits() {
  const { status, user, session } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const selection = studySubjectSelectionFromParams(params);
  const authScope = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "none",
  ].join(":");

  const [contextState, setContextState] =
    useState<ScopeState<ContextualDiscoveryResponse> | null>(null);
  const context = contextState?.scope === authScope ? contextState : null;
  const resolved = context?.data
    ? resolveStudySubject(selection, context.data.subjects)
    : null;
  const subject = resolved?.kind === "ready" ? resolved.subject : null;
  const subjectId = subject?.id ?? null;
  const scope = `${authScope}:${subjectId ?? "none"}`;

  const [kitState, setKitState] = useState<{
    scope: string;
    archive: PortableStudyKitArchive;
  } | null>(null);
  const cached = subjectId ? loadStudyKitWorkspace(scope) : null;
  const archive = subjectId
    ? kitState?.scope === scope
      ? kitState.archive
      : cached?.subjectId === subjectId
        ? cached
        : emptyStudyKitArchive(subjectId)
    : null;
  const [selectedState, setSelectedState] = useState<SelectionState | null>(
    null,
  );
  const selectedId =
    selectedState?.scope === scope
      ? selectedState.kitId
      : (archive?.kits[0]?.id ?? null);
  const selectedKit =
    archive?.kits.find((kit) => kit.id === selectedId) ?? null;
  const selectedKitId = selectedKit?.id ?? null;
  // Verified UUIDs never contain commas. A primitive key avoids revalidating
  // resources merely because a rebuilt archive changes array identity.
  const selectedResourceIdsKey = selectedKit?.resourceIds.join(",") ?? null;
  const verifyKey = `${scope}:${selectedId ?? "none"}:${selectedResourceIdsKey ?? ""}`;
  const syncScope = [
    scope,
    selectedKit?.id ?? "none",
    selectedKit?.title ?? "",
    selectedKit?.notes ?? "",
    selectedKit?.resourceIds.join(",") ?? "",
  ].join(":");

  const [savedState, setSavedState] = useState<ScopeState<ResourcePage> | null>(
    null,
  );
  const [foundState, setFoundState] = useState<ScopeState<ResourcePage> | null>(
    null,
  );
  const savedCursors = useRef({ scope, values: new Set<string>() });
  const foundCursors = useRef({ scope, values: new Set<string>() });
  const saved = savedState?.scope === scope ? savedState : null;
  const found = foundState?.scope === scope ? foundState : null;
  const [verifiedState, setVerifiedState] = useState<ScopeState<
    VerifiedResource[]
  > | null>(null);
  const verified = verifiedState?.scope === verifyKey ? verifiedState : null;
  const [feedbackState, setFeedbackState] = useState<KitFeedback | null>(null);
  const feedback = feedbackState?.scope === scope ? feedbackState : null;
  const [createForm, setCreateForm] = useState<{
    scope: string;
    title: string;
    notes: string;
  } | null>(null);
  const newTitle = createForm?.scope === scope ? createForm.title : "";
  const newNotes = createForm?.scope === scope ? createForm.notes : "";
  const [editing, setEditing] = useState<{
    scope: string;
    kitId: string;
  } | null>(null);
  const isEditing = editing?.scope === scope && editing.kitId === selectedId;
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [syncState, setSyncState] = useState<{
    scope: string;
    busy: boolean;
    progress: StudyKitSyncProgress | null;
    error: string | null;
  } | null>(null);
  const currentSync = syncState?.scope === syncScope ? syncState : null;

  const {
    begin: beginContext,
    isCurrent: contextCurrent,
    finish: finishContext,
  } = useAsyncAuthorityFence(`study-kit-context:${authScope}`);
  const {
    begin: beginSaved,
    isCurrent: savedCurrent,
    finish: finishSaved,
  } = useAsyncAuthorityFence(`study-kit-saved:${scope}`);
  const {
    begin: beginFound,
    isCurrent: foundCurrent,
    finish: finishFound,
  } = useAsyncAuthorityFence(`study-kit-found:${scope}`);
  const {
    begin: beginVerify,
    isCurrent: verifyCurrent,
    finish: finishVerify,
  } = useAsyncAuthorityFence(`study-kit-verification:${verifyKey}`);

  const {
    begin: beginSync,
    isCurrent: syncCurrent,
    finish: finishSync,
  } = useAsyncAuthorityFence(`study-kit-persistent-sync:${syncScope}`);

  const updateArchive = (next: PortableStudyKitArchive) => {
    if (!subjectId || next.subjectId !== subjectId) return;
    setKitState({ scope, archive: next });
    saveStudyKitWorkspace(scope, next);
    setFeedbackState(null);
  };

  const loadContext = useCallback(async () => {
    if (status !== "authenticated") return;
    const ticket = beginContext();
    if (!contextCurrent(ticket)) return;
    setContextState({
      scope: authScope,
      loading: true,
      data: null,
      error: null,
    });
    try {
      const data = await searchApi.contextual(
        { subjectLimit: 8, resourcesPerSubject: 1 },
        ticket.signal,
      );
      if (contextCurrent(ticket)) {
        setContextState({
          scope: authScope,
          loading: false,
          data,
          error: null,
        });
      }
    } catch (error) {
      if (contextCurrent(ticket)) {
        setContextState({
          scope: authScope,
          loading: false,
          data: null,
          error: errorFor(error),
        });
      }
    } finally {
      finishContext(ticket);
    }
  }, [status, authScope, beginContext, contextCurrent, finishContext]);

  const loadSaved = useCallback(
    async (cursor?: string) => {
      if (!subjectId) return;
      const ticket = beginSaved();
      if (!savedCurrent(ticket)) return;
      setSavedState((previous) => ({
        scope,
        loading: true,
        error: null,
        data: previous?.scope === scope ? previous.data : null,
      }));
      try {
        const response = await resourcesApi.savedBySubject(
          subjectId,
          cursor,
          ticket.signal,
        );
        if (savedCurrent(ticket)) {
          const used =
            savedCursors.current.scope === scope
              ? savedCursors.current.values
              : new Set<string>();
          if (
            cursor &&
            studyKitCursorRepeats(used, cursor, response.nextCursor)
          ) {
            const values = new Set(used);
            values.add(cursor);
            savedCursors.current = { scope, values };
            setSavedState((previous) => ({
              scope,
              loading: false,
              error:
                "Los apuntes guardados repitieron una página. Actualizá las fuentes para continuar.",
              data: {
                items: addDistinct(
                  previous?.scope === scope ? (previous.data?.items ?? []) : [],
                  response.items,
                ),
                nextCursor: null,
                cursorCycle: true,
              },
            }));
            return;
          }
          if (cursor) {
            const values = new Set(used);
            values.add(cursor);
            savedCursors.current = { scope, values };
          } else {
            savedCursors.current = { scope, values: new Set<string>() };
          }
          setSavedState((previous) => ({
            scope,
            loading: false,
            error: null,
            data: {
              items:
                cursor && previous?.scope === scope && previous.data
                  ? addDistinct(previous.data.items, response.items)
                  : response.items,
              nextCursor: response.nextCursor,
              cursorCycle: false,
            },
          }));
        }
      } catch (error) {
        if (savedCurrent(ticket)) {
          const accessRevoked =
            isResourcesApiError(error) &&
            [401, 403, 404].includes(error.status);
          if (accessRevoked) {
            savedCursors.current = { scope, values: new Set<string>() };
          }
          setSavedState((previous) => ({
            scope,
            loading: false,
            error: errorFor(error),
            data:
              previous?.scope === scope && !accessRevoked
                ? previous.data
                : null,
          }));
        }
      } finally {
        finishSaved(ticket);
      }
    },
    [subjectId, scope, beginSaved, savedCurrent, finishSaved],
  );

  const loadFound = useCallback(
    async (cursor?: string) => {
      if (!subjectId) return;
      const ticket = beginFound();
      if (!foundCurrent(ticket)) return;
      setFoundState((previous) => ({
        scope,
        loading: true,
        error: null,
        data: previous?.scope === scope ? previous.data : null,
      }));
      try {
        const response = await resourcesApi.search(
          { subjectId, cursor },
          ticket.signal,
        );
        if (foundCurrent(ticket)) {
          const used =
            foundCursors.current.scope === scope
              ? foundCursors.current.values
              : new Set<string>();
          if (
            cursor &&
            studyKitCursorRepeats(used, cursor, response.nextCursor)
          ) {
            const values = new Set(used);
            values.add(cursor);
            foundCursors.current = { scope, values };
            setFoundState((previous) => ({
              scope,
              loading: false,
              error:
                "Los apuntes encontrados repitieron una página. Actualizá las fuentes para continuar.",
              data: {
                items: addDistinct(
                  previous?.scope === scope ? (previous.data?.items ?? []) : [],
                  response.items,
                ),
                nextCursor: null,
                cursorCycle: true,
              },
            }));
            return;
          }
          if (cursor) {
            const values = new Set(used);
            values.add(cursor);
            foundCursors.current = { scope, values };
          } else {
            foundCursors.current = { scope, values: new Set<string>() };
          }
          setFoundState((previous) => ({
            scope,
            loading: false,
            error: null,
            data: {
              items:
                cursor && previous?.scope === scope && previous.data
                  ? addDistinct(previous.data.items, response.items)
                  : response.items,
              nextCursor: response.nextCursor,
              cursorCycle: false,
            },
          }));
        }
      } catch (error) {
        if (foundCurrent(ticket)) {
          const accessRevoked =
            isSearchApiError(error) && [401, 403, 404].includes(error.status);
          if (accessRevoked) {
            foundCursors.current = { scope, values: new Set<string>() };
          }
          setFoundState((previous) => ({
            scope,
            loading: false,
            error: errorFor(error),
            data:
              previous?.scope === scope && !accessRevoked
                ? previous.data
                : null,
          }));
        }
      } finally {
        finishFound(ticket);
      }
    },
    [subjectId, scope, beginFound, foundCurrent, finishFound],
  );

  const loadVerified = useCallback(async () => {
    if (!subjectId || !selectedKitId || selectedResourceIdsKey === null) return;
    const ticket = beginVerify();
    if (!verifyCurrent(ticket)) return;
    setVerifiedState({
      scope: verifyKey,
      loading: true,
      data: null,
      error: null,
    });
    try {
      const data = await verifyKitResources(
        subjectId,
        selectedResourceIdsKey ? selectedResourceIdsKey.split(",") : [],
        ticket.signal,
      );
      if (verifyCurrent(ticket)) {
        setVerifiedState({
          scope: verifyKey,
          loading: false,
          data,
          error: null,
        });
      }
    } catch (error) {
      if (verifyCurrent(ticket)) {
        setVerifiedState({
          scope: verifyKey,
          loading: false,
          data: null,
          error: errorFor(error),
        });
      }
    } finally {
      finishVerify(ticket);
    }
  }, [
    subjectId,
    selectedKitId,
    selectedResourceIdsKey,
    verifyKey,
    beginVerify,
    verifyCurrent,
    finishVerify,
  ]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);
  useEffect(() => {
    if (!subjectId) return;
    void loadSaved();
    void loadFound();
  }, [subjectId, loadSaved, loadFound]);
  useEffect(() => {
    if (selectedKitId) void loadVerified();
  }, [loadVerified, selectedKitId]);

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!archive || !subjectId) return;
    try {
      const id = crypto.randomUUID();
      const next = createStudyKit(archive, {
        id,
        title: newTitle,
        notes: newNotes,
      });
      updateArchive(next);
      setSelectedState({ scope, kitId: id });
      setCreateForm({ scope, title: "", notes: "" });
    } catch (error) {
      setFeedbackState({ scope, error: true, text: errorFor(error) });
    }
  };

  const updateSelected = (
    operation: (current: PortableStudyKitArchive) => PortableStudyKitArchive,
  ) => {
    if (!archive) return;
    try {
      updateArchive(operation(archive));
    } catch (error) {
      setFeedbackState({ scope, error: true, text: errorFor(error) });
    }
  };

  const renameSelected = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId) return;
    updateSelected((current) =>
      changeStudyKit(current, selectedId, {
        title: draftTitle,
        notes: draftNotes,
      }),
    );
    setEditing(null);
  };

  const removeSelected = () => {
    if (!selectedKit || !archive) return;
    if (
      !window.confirm(
        `¿Eliminar "${selectedKit.title}" del borrador? Si no lo exportaste, no se puede recuperar.`,
      )
    )
      return;
    updateSelected((current) => deleteStudyKit(current, selectedKit.id));
    setSelectedState({
      scope,
      kitId: archive.kits.find((k) => k.id !== selectedKit.id)?.id ?? null,
    });
    setEditing(null);
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !subjectId) return;
    const startedScope = scope;
    try {
      if (file.size > STUDY_KIT_MAX_FILE_BYTES) {
        throw new Error("STUDY_KIT_FILE_TOO_LARGE");
      }
      const text = await file.text();
      // A new signed-in user/subject might have taken over while file.text()
      // was pending. The handler's subject/scope belongs to this render.
      // A fresh scope is required before committing its parsed content.
      const candidate = readStudyKitArchive(text);
      if (candidate.subjectId !== subjectId) {
        throw new Error("STUDY_KIT_SUBJECT_MISMATCH");
      }
      if (
        !window.confirm(
          "Importar reemplazará las colecciones temporales de esta materia. ¿Continuar?",
        )
      )
        return;
      if (activeScopeRef.current !== startedScope) return;
      updateArchive(candidate);
      setSelectedState({ scope, kitId: candidate.kits[0]?.id ?? null });
      setFeedbackState({
        scope,
        error: false,
        text: "Colecciones importadas. Los apuntes se comprueban al abrir cada colección.",
      });
    } catch (error) {
      if (activeScopeRef.current === startedScope) {
        setFeedbackState({ scope, error: true, text: errorFor(error) });
      }
    }
  };

  const activeScopeRef = useRef(scope);
  activeScopeRef.current = scope;

  const exportArchive = () => {
    if (!archive) return;
    try {
      downloadKitArchive(serializeStudyKitArchive(archive));
      setFeedbackState({
        scope,
        error: false,
        text: "Archivo preparado. Revisá las descargas del navegador.",
      });
    } catch (error) {
      setFeedbackState({ scope, error: true, text: errorFor(error) });
    }
  };

  const syncSelectedKit = () => {
    if (
      !PERSISTENT_COLLECTIONS_VISIBLE ||
      status !== "authenticated" ||
      !subjectId ||
      !selectedKit ||
      currentSync?.busy
    )
      return;
    if (
      !window.confirm(
        `¿Sincronizar "${selectedKit.title}" y hasta ${selectedKit.resourceIds.length} referencias? ` +
          "El kit portátil se conserva. Se agregan referencias accesibles, pero NO se quitan apuntes ya sincronizados.",
      )
    )
      return;
    const ticket = beginSync();
    if (!syncCurrent(ticket)) return;
    setSyncState({ scope: syncScope, busy: true, progress: null, error: null });
    void syncStudyKitToCollection(
      { kit: selectedKit, subjectId },
      {
        createCollection: (input, signal) =>
          studyCollectionsApi.create(input, signal),
        readResource: (id, signal) => resourcesApi.get(id, signal),
        addResource: (collectionId, resourceId, signal) =>
          studyCollectionsApi.add(collectionId, resourceId, signal),
      },
      ticket.signal,
      (progress) => {
        if (syncCurrent(ticket)) {
          setSyncState({
            scope: syncScope,
            busy: true,
            progress,
            error: null,
          });
        }
      },
    )
      .then(
        (progress) => {
          if (syncCurrent(ticket)) {
            setSyncState({
              scope: syncScope,
              busy: false,
              progress,
              error: null,
            });
          }
        },
        (error: unknown) => {
          if (syncCurrent(ticket)) {
            setSyncState({
              scope: syncScope,
              busy: false,
              progress:
                error instanceof StudyKitSyncError ? error.progress : null,
              error: syncErrorFor(error),
            });
          }
        },
      )
      .finally(() => {
        finishSync(ticket);
      });
  };

  const openInPlanner = () => {
    if (!archive || !selectedKit || !subjectId || status !== "authenticated")
      return;
    try {
      const plan = studyKitToSession(archive, selectedKit.id);
      const handoff = createStudyHandoff(plan, scope);
      navigate(`/study/session?subjectId=${encodeURIComponent(subjectId)}`, {
        state: handoff,
      });
    } catch (error) {
      setFeedbackState({ scope, error: true, text: errorFor(error) });
    }
  };

  const clearWorkspace = () => {
    if (!archive || !subjectId) return;
    if (
      !window.confirm(
        "¿Vaciar todas las colecciones temporales? Exportá antes de continuar si querés conservarlas.",
      )
    )
      return;
    forgetStudyKitWorkspace(scope);
    setKitState({ scope, archive: emptyStudyKitArchive(subjectId) });
    setSelectedState({ scope, kitId: null });
    setFeedbackState({
      scope,
      error: false,
      text: "Colecciones temporales vaciadas.",
    });
  };

  const items = addDistinct(
    saved?.data?.items ?? [],
    found?.data?.items ?? [],
  ).filter((item) => item.academic.subject.id === subjectId);
  const kitIds = new Set(selectedKit?.resourceIds ?? []);
  const visible = verified?.data ?? [];
  const missing = visible.filter((item) => item.title === null).length;

  return (
    <section className="study-kits" aria-labelledby="study-kits-title">
      <header className="study-kits-hero">
        <div>
          <p className="study-kits-kicker">Colecciones portátiles</p>
          <h1 id="study-kits-title">Mis kits de estudio</h1>
          <p>
            Armá conjuntos de apuntes para un parcial o final. El borrador
            portátil vive en esta pestaña: exportá su JSON para conservarlo.{" "}
            {PERSISTENT_COLLECTIONS_VISIBLE &&
              "También podés copiar un kit a Colecciones sincronizadas cuando el servidor lo permita."}
          </p>
        </div>
        <Link
          to={subjectId ? (studySubjectHref(subjectId) ?? "/study") : "/study"}
        >
          Volver a Mesa de estudio
        </Link>
      </header>
      {status !== "authenticated" || !context || context.loading ? (
        <p role="status">Buscando tu materia actual…</p>
      ) : context.error ? (
        <div role="alert" className="study-kits-error">
          <p>{context.error}</p>
          <button type="button" onClick={() => void loadContext()}>
            Reintentar
          </button>
        </div>
      ) : !subject || !archive || resolved?.kind !== "ready" ? (
        <div className="study-kits-panel" role="status">
          <h2>Seleccioná una materia desde la Mesa</h2>
          <p>
            La herramienta solo admite una materia actual devuelta por el
            servidor. El enlace por sí solo no concede acceso.
          </p>
          <Link to="/study">Ir a mis materias</Link>
        </div>
      ) : (
        <>
          <div className="study-kits-subject">
            <strong>{subject.name}</strong>
            <span>
              Hasta {STUDY_KIT_MAX_COLLECTIONS} kits, {STUDY_KIT_MAX_RESOURCES}{" "}
              apuntes por kit. Sin sincronización automática.
            </span>
          </div>
          <div className="study-kits-toolbar">
            <button type="button" onClick={exportArchive}>
              Exportar mis colecciones JSON
            </button>
            <label>
              Importar JSON de la materia
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                onChange={(event) => void importFile(event)}
              />
            </label>
            <button type="button" onClick={clearWorkspace}>
              Vaciar colecciones temporales
            </button>
          </div>
          {feedback && (
            <p
              className={
                feedback.error ? "study-kits-error" : "study-kits-notice"
              }
              role={feedback.error ? "alert" : "status"}
            >
              {feedback.text}
            </p>
          )}
          <div className="study-kits-layout">
            <aside className="study-kits-panel" aria-label="Colecciones">
              <h2>Mis colecciones ({archive.kits.length})</h2>
              {archive.kits.length === 0 && (
                <p>Todavía no creaste colecciones para esta materia.</p>
              )}
              <ul className="study-kits-selector">
                {archive.kits.map((kit) => (
                  <li key={kit.id}>
                    <button
                      type="button"
                      aria-pressed={selectedId === kit.id}
                      onClick={() => {
                        setSelectedState({ scope, kitId: kit.id });
                        setEditing(null);
                      }}
                    >
                      <strong>{kit.title}</strong>
                      <small>{kit.resourceIds.length} apuntes</small>
                    </button>
                  </li>
                ))}
              </ul>
              <form className="study-kits-form" onSubmit={create}>
                <h3>Nueva colección</h3>
                <label>
                  Nombre
                  <input
                    value={newTitle}
                    maxLength={100}
                    required
                    onChange={(event) =>
                      setCreateForm({
                        scope,
                        title: event.target.value,
                        notes: newNotes,
                      })
                    }
                  />
                </label>
                <label>
                  Notas personales
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={newNotes}
                    onChange={(event) =>
                      setCreateForm({
                        scope,
                        title: newTitle,
                        notes: event.target.value,
                      })
                    }
                  />
                </label>
                <button
                  type="submit"
                  disabled={archive.kits.length >= STUDY_KIT_MAX_COLLECTIONS}
                >
                  Crear colección
                </button>
              </form>
            </aside>
            <main
              className="study-kits-panel"
              aria-label="Contenido de la colección"
            >
              {!selectedKit ? (
                <div className="study-kits-empty">
                  <h2>Elegí o creá una colección</h2>
                  <p>
                    Podés agrupar apuntes visibles sin generar nuevos permisos.
                  </p>
                </div>
              ) : (
                <>
                  <div className="study-kits-collection-header">
                    <div>
                      <h2>{selectedKit.title}</h2>
                      {selectedKit.notes && <p>{selectedKit.notes}</p>}
                      <p>
                        {selectedKit.resourceIds.length}/
                        {STUDY_KIT_MAX_RESOURCES} apuntes
                      </p>
                    </div>
                    <div className="study-kits-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing({ scope, kitId: selectedKit.id });
                          setDraftTitle(selectedKit.title);
                          setDraftNotes(selectedKit.notes);
                        }}
                      >
                        Editar
                      </button>
                      <button type="button" onClick={removeSelected}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                  {isEditing && (
                    <form className="study-kits-form" onSubmit={renameSelected}>
                      <label>
                        Nombre
                        <input
                          required
                          maxLength={100}
                          value={draftTitle}
                          onChange={(event) =>
                            setDraftTitle(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Notas
                        <textarea
                          maxLength={500}
                          rows={3}
                          value={draftNotes}
                          onChange={(event) =>
                            setDraftNotes(event.target.value)
                          }
                        />
                      </label>
                      <div className="study-kits-actions">
                        <button type="submit">Guardar cambios</button>
                        <button type="button" onClick={() => setEditing(null)}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                  <div className="study-kits-actions">
                    <button
                      type="button"
                      disabled={selectedKit.resourceIds.length === 0}
                      onClick={openInPlanner}
                    >
                      Preparar sesión con este kit
                    </button>
                    <button
                      type="button"
                      disabled={verified?.loading}
                      onClick={() => void loadVerified()}
                    >
                      Verificar permisos
                    </button>
                    {PERSISTENT_COLLECTIONS_VISIBLE && (
                      <button
                        type="button"
                        disabled={currentSync?.busy}
                        onClick={syncSelectedKit}
                      >
                        {currentSync?.busy
                          ? "Copiando…"
                          : "Copiar kit a Colecciones sincronizadas"}
                      </button>
                    )}
                  </div>
                  {PERSISTENT_COLLECTIONS_VISIBLE && currentSync && (
                    <div
                      className="study-kits-sync-report"
                      role={currentSync.error ? "alert" : "status"}
                    >
                      {currentSync.busy ? (
                        <p>
                          Sincronizando referencias…{" "}
                          {currentSync.progress
                            ? `${currentSync.progress.linked + currentSync.progress.skipped}/${currentSync.progress.total}`
                            : "creando o recuperando la colección"}
                          .
                        </p>
                      ) : currentSync.error ? (
                        <p>
                          {currentSync.error} Podés reintentar: se usa la misma
                          colección y los apuntes ya vinculados no se duplican.
                        </p>
                      ) : (
                        <p>
                          Copia terminada. Referencias verificadas y vinculadas
                          (incluidas las previamente vinculadas):{" "}
                          {currentSync.progress?.linked ?? 0}; omitidas por
                          falta de acceso o materia diferente:{" "}
                          {currentSync.progress?.skipped ?? 0}.
                        </p>
                      )}
                      {currentSync.progress?.collectionId && (
                        <Link
                          to={`/study-collections?collection=${encodeURIComponent(currentSync.progress.collectionId)}`}
                        >
                          Ver colección sincronizada
                        </Link>
                      )}
                    </div>
                  )}
                  <h3>Apuntes de la colección</h3>
                  {verified?.loading && (
                    <p role="status">Comprobando permisos del material…</p>
                  )}
                  {verified?.error && (
                    <p role="alert" className="study-kits-error">
                      {verified.error} No se mostrarán títulos sin validar.
                    </p>
                  )}
                  {missing > 0 && (
                    <p role="status">
                      {missing} referencias ya no están disponibles o no
                      pertenecen a la materia.
                    </p>
                  )}
                  {selectedKit.resourceIds.length === 0 && (
                    <p>Agregá apuntes desde la biblioteca disponible.</p>
                  )}
                  <ol className="study-kits-items">
                    {selectedKit.resourceIds.map((resourceId, index) => {
                      const item = visible.find(
                        (row) => row.resourceId === resourceId,
                      );
                      const title = item?.title ?? null;
                      return (
                        <li key={resourceId}>
                          <div>
                            {title ? (
                              <Link
                                to={`/resources/${encodeURIComponent(resourceId)}`}
                              >
                                {title}
                              </Link>
                            ) : (
                              <strong>Referencia sin acceso confirmado</strong>
                            )}
                            <small>Elemento {index + 1}</small>
                          </div>
                          <div className="study-kits-actions">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() =>
                                updateSelected((value) =>
                                  moveStudyKitResource(
                                    value,
                                    selectedKit.id,
                                    index,
                                    -1,
                                  ),
                                )
                              }
                            >
                              Subir
                            </button>
                            <button
                              type="button"
                              disabled={
                                index === selectedKit.resourceIds.length - 1
                              }
                              onClick={() =>
                                updateSelected((value) =>
                                  moveStudyKitResource(
                                    value,
                                    selectedKit.id,
                                    index,
                                    1,
                                  ),
                                )
                              }
                            >
                              Bajar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelected((value) =>
                                  removeStudyKitResource(
                                    value,
                                    selectedKit.id,
                                    resourceId,
                                  ),
                                )
                              }
                            >
                              Quitar
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <section
                    className="study-kits-sources"
                    aria-label="Explorar apuntes"
                  >
                    <h3>Agregar apuntes visibles</h3>
                    <StudyKitResourceSearch
                      key={`${scope}:${selectedKit.id}`}
                      authorityScope={scope}
                      subjectId={subject.id}
                      resourceIds={selectedKit.resourceIds}
                      limitReached={
                        selectedKit.resourceIds.length >=
                        STUDY_KIT_MAX_RESOURCES
                      }
                      onAdd={(resourceId) =>
                        updateSelected((value) =>
                          addStudyKitResource(
                            value,
                            selectedKit.id,
                            resourceId,
                          ),
                        )
                      }
                    />

                    {saved?.error && (
                      <p className="study-kits-error" role="alert">
                        {saved.error}
                      </p>
                    )}
                    {found?.error && (
                      <p className="study-kits-error" role="alert">
                        {found.error}
                      </p>
                    )}
                    {(saved?.loading || found?.loading) && (
                      <p role="status">Buscando apuntes…</p>
                    )}
                    {items.length === 0 &&
                      !saved?.loading &&
                      !found?.loading && (
                        <p>
                          No se encontraron apuntes en las páginas cargadas.
                          Podés explorar la biblioteca completa.
                        </p>
                      )}
                    <ul className="study-kits-discovery">
                      {items.map((item) => (
                        <li key={item.id}>
                          <Link
                            to={`/resources/${encodeURIComponent(item.id)}`}
                          >
                            {item.title}
                          </Link>
                          <button
                            type="button"
                            disabled={
                              kitIds.has(item.id) ||
                              selectedKit.resourceIds.length >=
                                STUDY_KIT_MAX_RESOURCES
                            }
                            onClick={() =>
                              updateSelected((value) =>
                                addStudyKitResource(
                                  value,
                                  selectedKit.id,
                                  item.id,
                                ),
                              )
                            }
                          >
                            {kitIds.has(item.id) ? "Agregado" : "Agregar"}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="study-kits-actions">
                      {saved?.data?.nextCursor && (
                        <button
                          type="button"
                          disabled={saved.loading}
                          onClick={() =>
                            void loadSaved(saved.data?.nextCursor ?? undefined)
                          }
                        >
                          Más guardados
                        </button>
                      )}
                      {found?.data?.nextCursor && (
                        <button
                          type="button"
                          disabled={found.loading}
                          onClick={() =>
                            void loadFound(found.data?.nextCursor ?? undefined)
                          }
                        >
                          Más apuntes
                        </button>
                      )}
                      {saved?.data?.cursorCycle && (
                        <button
                          type="button"
                          disabled={saved.loading}
                          onClick={() => void loadSaved()}
                        >
                          Actualizar guardados
                        </button>
                      )}
                      {found?.data?.cursorCycle && (
                        <button
                          type="button"
                          disabled={found.loading}
                          onClick={() => void loadFound()}
                        >
                          Actualizar encontrados
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={saved?.loading || found?.loading}
                        onClick={() => {
                          void loadSaved();
                          void loadFound();
                        }}
                      >
                        Actualizar fuentes
                      </button>
                    </div>
                  </section>
                </>
              )}
            </main>
          </div>
          <p className="study-kits-footer">
            Los nombres se revalidan al abrir la colección; el archivo exportado
            contiene solo tus nombres y notas, IDs de materia y referencias, no
            información privada de otros usuarios. Al ingresar al Planificador,
            los accesos se comprueban nuevamente.
          </p>
        </>
      )}
    </section>
  );
}
