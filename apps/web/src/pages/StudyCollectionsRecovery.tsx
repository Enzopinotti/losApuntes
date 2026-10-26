import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../contexts/useAuth";
import { resourcesApi } from "../features/resources/services/resourcesService";
import { PERSISTENT_COLLECTIONS_VISIBLE } from "../features/study-collections/persistentCollectionsFlags";
import {
  studyCollectionsApi,
  type StudyCollection,
} from "../features/study-collections/studyCollectionsService";
import { collectionRecoveryCursorRepeats } from "../features/study-collections/collection-recovery-list-pagination";
import {
  CollectionRecoveryError,
  inspectCollectionHealth,
  repairMissingReferences,
  type CollectionHealthReport,
  type CollectionHealthProgress,
  type CollectionRepairProgress,
} from "../features/study-collections/collectionRecovery.mjs";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./StudyCollectionsRecovery.scss";

type CollectionList = {
  scope: string;
  items: StudyCollection[];
  nextCursor: string | null;
  busy: boolean;
  error: string | null;
};
type RecoveryState = {
  scope: string;
  mode: "scanning" | "ready" | "repairing" | "complete" | "error";
  report: CollectionHealthReport | null;
  scanning: CollectionHealthProgress | null;
  repairing: CollectionRepairProgress | null;
  error: string | null;
};

function recoveryError(error: unknown): string {
  if (error instanceof CollectionRecoveryError) {
    if (error.code === "RECOVERY_ABORTED")
      return "La operación se interrumpió.";
    if (error.failure instanceof Error) {
      if (
        "code" in error.failure &&
        (error.failure.code === "STUDY_COLLECTION_REVISION_CONFLICT" ||
          error.failure.code === "STUDY_COLLECTION_REFERENCE_ACCESSIBLE" ||
          error.failure.code === "STUDY_COLLECTION_REFERENCE_CHANGED")
      ) {
        return "El servidor detectó cambios de revisión o de acceso. Volvé a analizar la colección antes de continuar.";
      }
      if (
        error.failure.message === "RECOVERY_STALE_REVISION" ||
        error.failure.message === "RECOVERY_STALE_SCAN" ||
        error.failure.message === "RECOVERY_REVISION_OR_PAGE_INVALID"
      ) {
        return "La colección cambió mientras se revisaba. Volvé a analizarla antes de continuar.";
      }
    }
    return "No se pudo completar la revisión. La eliminación se detuvo; volvé a analizar antes de reintentar.";
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: number }).status;
    if (status === 401) return "Tu sesión venció. Iniciá sesión nuevamente.";
    if (status === 403 || status === 404)
      return "La colección dejó de estar disponible o no tenés acceso.";
    if (status === 503)
      return "Las Colecciones sincronizadas no están habilitadas.";
  }
  return "No se pudo completar la operación. Verificá tu conexión y reintentá.";
}

function shouldClearCollectionList(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  const status = (error as { status?: number }).status;
  return status === 401 || status === 403 || status === 404 || status === 503;
}

export default function StudyCollectionsRecovery() {
  const { status, user, session } = useAuth();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("collection") ?? "";
  const ownerScope = [status, user?.id ?? "", session?.id ?? ""].join(":");
  const scope = `${ownerScope}:${selectedId}`;
  const [listState, setListState] = useState<CollectionList | null>(null);
  const listCursorHistoryRef = useRef<{
    scope: string;
    cursors: Set<string>;
  } | null>(null);
  const [state, setState] = useState<RecoveryState | null>(null);
  const [actionLock, setActionLock] = useState<string | null>(null);
  const lockRef = useRef<string | null>(null);
  const list = listState?.scope === ownerScope ? listState : null;
  const current = state?.scope === scope ? state : null;
  const busy = actionLock !== null;
  const {
    begin: beginList,
    isCurrent: listCurrent,
    finish: finishList,
  } = useAsyncAuthorityFence(`collections-recovery-list:${ownerScope}`);
  const {
    begin: beginAction,
    isCurrent: actionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(`collections-recovery-action:${scope}`);

  const loadList = useCallback(
    async (cursor?: string) => {
      if (status !== "authenticated" || !PERSISTENT_COLLECTIONS_VISIBLE) return;
      const history =
        cursor && listCursorHistoryRef.current?.scope === ownerScope
          ? listCursorHistoryRef.current
          : { scope: ownerScope, cursors: new Set<string>() };
      listCursorHistoryRef.current = history;
      const ticket = beginList();
      if (!listCurrent(ticket)) return;
      setListState((previous) => ({
        scope: ownerScope,
        items: cursor && previous?.scope === ownerScope ? previous.items : [],
        nextCursor:
          cursor && previous?.scope === ownerScope ? previous.nextCursor : null,
        busy: true,
        error: null,
      }));
      try {
        const result = await studyCollectionsApi.list(cursor, ticket.signal);
        if (!listCurrent(ticket)) return;
        const cursorCycle =
          Boolean(cursor) &&
          collectionRecoveryCursorRepeats(
            history.cursors,
            cursor,
            result.nextCursor,
          );
        if (cursor) history.cursors.add(cursor);
        setListState((previous) => ({
          scope: ownerScope,
          items:
            cursor && previous?.scope === ownerScope
              ? Array.from(
                  new Map(
                    [...previous.items, ...result.items].map((item) => [
                      item.id,
                      item,
                    ]),
                  ).values(),
                )
              : result.items,
          nextCursor: cursorCycle ? null : result.nextCursor,
          busy: false,
          error: cursorCycle
            ? "La lista de Colecciones no avanzó. Actualizala para empezar de nuevo."
            : null,
        }));
      } catch (error) {
        if (listCurrent(ticket)) {
          const clearSource = shouldClearCollectionList(error);
          if (clearSource) history.cursors.clear();
          setListState((previous) => ({
            scope: ownerScope,
            items:
              cursor && previous?.scope === ownerScope && !clearSource
                ? previous.items
                : [],
            nextCursor:
              cursor && previous?.scope === ownerScope && !clearSource
                ? previous.nextCursor
                : null,
            busy: false,
            error: recoveryError(error),
          }));
        }
      } finally {
        finishList(ticket);
      }
    },
    [status, ownerScope, beginList, listCurrent, finishList],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const scan = () => {
    if (
      status !== "authenticated" ||
      !PERSISTENT_COLLECTIONS_VISIBLE ||
      !selectedId ||
      lockRef.current !== null
    )
      return;
    const ticket = beginAction();
    if (!actionCurrent(ticket)) return;
    lockRef.current = scope;
    setActionLock(scope);
    setState({
      scope,
      mode: "scanning",
      report: null,
      scanning: null,
      repairing: null,
      error: null,
    });
    void inspectCollectionHealth(
      selectedId,
      {
        get: (id, signal) => studyCollectionsApi.get(id, signal),
        resources: (id, cursor, signal) =>
          studyCollectionsApi.resources(id, cursor, signal),
      },
      ticket.signal,
      (progress) => {
        if (actionCurrent(ticket)) {
          setState({
            scope,
            mode: "scanning",
            report: null,
            scanning: progress,
            repairing: null,
            error: null,
          });
        }
      },
    )
      .then(
        (report) => {
          if (actionCurrent(ticket)) {
            setState({
              scope,
              mode: "ready",
              report,
              scanning: null,
              repairing: null,
              error: null,
            });
          }
        },
        (error: unknown) => {
          if (actionCurrent(ticket)) {
            setState({
              scope,
              mode: "error",
              report: null,
              scanning: null,
              repairing: null,
              error: recoveryError(error),
            });
          }
        },
      )
      .finally(() => {
        finishAction(ticket);
        if (lockRef.current === scope) {
          lockRef.current = null;
          setActionLock(null);
        }
      });
  };

  const repair = () => {
    if (
      status !== "authenticated" ||
      !PERSISTENT_COLLECTIONS_VISIBLE ||
      !current?.report ||
      current.report.missingIds.length === 0 ||
      current.mode !== "ready" ||
      lockRef.current !== null
    )
      return;
    const report = current.report;
    if (
      !window.confirm(
        `¿Quitar ${report.missingIds.length} referencias sin acceso de esta colección? ` +
          "El servidor verificará de nuevo el acceso y la revisión; los apuntes originales nunca se eliminan.",
      )
    )
      return;
    const ticket = beginAction();
    if (!actionCurrent(ticket)) return;
    lockRef.current = scope;
    setActionLock(scope);
    setState({
      scope,
      mode: "repairing",
      report,
      scanning: null,
      repairing: null,
      error: null,
    });
    void repairMissingReferences(
      report,
      {
        get: (id, signal) => studyCollectionsApi.get(id, signal),
        readResource: (id, signal) => resourcesApi.get(id, signal),
        remove: (id, resourceId, signal, expectedRevision) =>
          studyCollectionsApi.remove(id, resourceId, signal, expectedRevision),
      },
      ticket.signal,
      (progress) => {
        if (actionCurrent(ticket)) {
          setState({
            scope,
            mode: "repairing",
            report,
            scanning: null,
            repairing: progress,
            error: null,
          });
        }
      },
    )
      .then(
        (progress) => {
          if (actionCurrent(ticket)) {
            setState({
              scope,
              mode: "complete",
              report: null,
              scanning: null,
              repairing: progress,
              error: null,
            });
            void loadList();
          }
        },
        (error: unknown) => {
          if (actionCurrent(ticket)) {
            setState({
              scope,
              mode: "error",
              report: null,
              scanning: null,
              repairing:
                error instanceof CollectionRecoveryError
                  ? (error.progress as CollectionRepairProgress)
                  : null,
              error: recoveryError(error),
            });
          }
        },
      )
      .finally(() => {
        finishAction(ticket);
        if (lockRef.current === scope) {
          lockRef.current = null;
          setActionLock(null);
        }
      });
  };

  if (!PERSISTENT_COLLECTIONS_VISIBLE) {
    return (
      <main className="collections-recovery">
        <h1>Diagnóstico de Colecciones no disponible</h1>
        <p>
          La sincronización está desactivada. Tus kits portátiles siguen
          disponibles.
        </p>
        <Link to="/study/kits">Ir a kits portátiles</Link>
      </main>
    );
  }

  return (
    <main className="collections-recovery">
      <header>
        <p className="collections-recovery-eyebrow">
          Mantenimiento de mi biblioteca
        </p>
        <h1>Revisar Colecciones sincronizadas</h1>
        <p>
          Detectá referencias a apuntes que dejaron de estar disponibles. La
          revisión es de solo lectura; quitar referencias requiere tu
          confirmación.
        </p>
        <Link to="/study-collections">Volver a Colecciones</Link>
      </header>

      <section
        className="collections-recovery-panel"
        aria-label="Seleccionar colección"
      >
        <h2>Elegí una colección</h2>
        {list?.error && <p role="alert">{list.error}</p>}
        {list?.busy && <p role="status">Cargando colecciones…</p>}
        {list && !list.busy && !list.error && list.items.length === 0 && (
          <p>No hay Colecciones en las páginas cargadas.</p>
        )}
        <ul className="collections-recovery-selector">
          {list?.items.map((collection) => (
            <li key={collection.id}>
              <button
                type="button"
                aria-pressed={selectedId === collection.id}
                disabled={busy}
                onClick={() => setParams({ collection: collection.id })}
              >
                <strong>{collection.title}</strong>
                <small>{collection.resourceCount} referencias</small>
              </button>
            </li>
          ))}
        </ul>
        {list?.nextCursor && (
          <button
            type="button"
            disabled={list.busy || busy}
            onClick={() => void loadList(list.nextCursor ?? undefined)}
          >
            Mostrar más Colecciones
          </button>
        )}
        <button
          type="button"
          disabled={list?.busy || busy}
          onClick={() => void loadList()}
        >
          Actualizar lista de Colecciones
        </button>
      </section>

      <section
        className="collections-recovery-panel"
        aria-label="Inspección y recuperación"
      >
        <h2>Estado de las referencias</h2>
        {!selectedId ? (
          <p>Seleccioná una Colección para comenzar la inspección.</p>
        ) : (
          <>
            <button type="button" onClick={scan} disabled={busy}>
              {current?.mode === "scanning"
                ? "Revisando…"
                : "Analizar referencias"}
            </button>
            {current?.mode === "scanning" && (
              <p role="status">
                Comprobadas {current.scanning?.inspected ?? 0}
                {current.scanning?.total !== null &&
                current.scanning?.total !== undefined
                  ? ` de ${current.scanning.total}`
                  : ""}{" "}
                referencias…
              </p>
            )}
            {current?.error && <p role="alert">{current.error}</p>}
            {current?.mode === "ready" && current.report && (
              <div className="collections-recovery-results">
                <p role="status">
                  Inspección completa: {current.report.accessible} accesibles y{" "}
                  {current.report.missingIds.length} referencias sin acceso
                  confirmado, de {current.report.total}.
                </p>
                {current.report.missingIds.length > 0 ? (
                  <>
                    <p>
                      La limpieza solo elimina vínculos de tu Colección, nunca
                      los archivos originales. Se comprobará cada referencia
                      nuevamente antes de quitarla.
                    </p>
                    <button type="button" disabled={busy} onClick={repair}>
                      Quitar referencias sin acceso
                    </button>
                  </>
                ) : (
                  <p>
                    No hay referencias sin acceso en la inspección completa.
                  </p>
                )}
              </div>
            )}
            {current?.mode === "repairing" && (
              <p role="status">
                Revisando antes de quitar: {current.repairing?.processed ?? 0}/
                {current.repairing?.total ?? current.report?.missingIds.length}{" "}
                referencias.
              </p>
            )}
            {current?.mode === "complete" && current.repairing && (
              <div role="status" className="collections-recovery-results">
                <p>
                  Limpieza terminada: {current.repairing.removed} vínculos
                  quitados; {current.repairing.restored} preservados porque
                  volvió su acceso.
                </p>
                <p>
                  Podés volver a analizar para comprobar el estado actualizado.
                </p>
              </div>
            )}
            {current?.mode === "error" && current.repairing && (
              <p role="status">
                Operación parcial: {current.repairing.removed} vínculos quitados
                antes del error. Volvé a analizar antes de hacer otra limpieza.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
