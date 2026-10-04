import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/useAuth";
import type {
  PilotMetricsResponse,
  PilotModerationAction,
  PilotModerationItem,
} from "../features/pilot/interfaces";
import {
  isPilotApiError,
  pilotApi,
} from "../features/pilot/services/pilotService";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./Pilot.scss";

function percentage(value: number): string {
  return `${value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
  })}%`;
}

function returningRate(activeUsers: number, returningUsers: number): string {
  if (activeUsers === 0) return "0%";
  return percentage((returningUsers / activeUsers) * 100);
}

const AdminPilot = () => {
  const { status, user, session } = useAuth();
  const authScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const [days, setDays] = useState(14);
  const loadScopeKey = [authScopeKey, String(days)].join(":");
  const {
    begin: beginLoad,
    isCurrent: isLoadCurrent,
    finish: finishLoad,
  } = useAsyncAuthorityFence(`pilot-admin-load:${loadScopeKey}`);
  const {
    begin: beginAction,
    isCurrent: isActionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(`pilot-admin-action:${authScopeKey}`);

  const [snapshotState, setSnapshotState] = useState<{
    scopeKey: string;
    metrics: PilotMetricsResponse;
    queue: PilotModerationItem[];
  } | null>(null);
  const snapshot =
    snapshotState?.scopeKey === loadScopeKey ? snapshotState : null;
  const metrics = snapshot?.metrics ?? null;
  const queue = snapshot?.queue ?? [];

  const [reason, setReason] = useState<Record<string, string>>({});
  const [viewState, setViewState] = useState<{
    scopeKey: string;
    forbidden: boolean;
    error: string | null;
  } | null>(null);
  const currentViewState =
    viewState?.scopeKey === loadScopeKey ? viewState : null;
  const forbidden = currentViewState?.forbidden ?? false;

  const [actionState, setActionState] = useState<{
    scopeKey: string;
    busy: string | null;
    error: string | null;
  } | null>(null);
  const currentActionState =
    actionState?.scopeKey === authScopeKey ? actionState : null;
  const busy = currentActionState?.busy ?? null;
  const error =
    currentActionState?.error ?? currentViewState?.error ?? null;

  const load = useCallback(async () => {
    const ticket = beginLoad();
    if (!isLoadCurrent(ticket)) return;
    setViewState({
      scopeKey: loadScopeKey,
      forbidden: false,
      error: null,
    });

    try {
      const [metricsResult, queueResult] = await Promise.all([
        pilotApi.metrics(days, ticket.signal),
        pilotApi.moderation("pending", 50, ticket.signal),
      ]);
      if (!isLoadCurrent(ticket)) return;
      setSnapshotState({
        scopeKey: loadScopeKey,
        metrics: metricsResult,
        queue: queueResult.items,
      });
    } catch (nextError) {
      if (!isLoadCurrent(ticket)) return;
      if (isPilotApiError(nextError) && nextError.status === 403) {
        setSnapshotState((current) =>
          current?.scopeKey === loadScopeKey ? null : current,
        );
        setViewState({
          scopeKey: loadScopeKey,
          forbidden: true,
          error: null,
        });
        return;
      }

      setViewState({
        scopeKey: loadScopeKey,
        forbidden: false,
        error: isPilotApiError(nextError)
          ? nextError.message
          : "No pudimos cargar la operación del piloto.",
      });
    } finally {
      finishLoad(ticket);
    }
  }, [
    beginLoad,
    days,
    finishLoad,
    isLoadCurrent,
    loadScopeKey,
  ]);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setReason({});
    setActionState(null);
  }, [authScopeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (
    item: PilotModerationItem,
    action: PilotModerationAction,
  ) => {
    const reviewReason = reason[item.reportId]?.trim() ?? "";
    if (reviewReason.length < 3) {
      setActionState({
        scopeKey: authScopeKey,
        busy: null,
        error: "Ingresá un motivo de revisión de al menos 3 caracteres.",
      });
      return;
    }

    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    setActionState({
      scopeKey: authScopeKey,
      busy: item.reportId,
      error: null,
    });

    try {
      await pilotApi.review(
        item.kind,
        item.reportId,
        action,
        reviewReason,
        ticket.signal,
      );
      if (!isActionCurrent(ticket)) return;
      setReason((current) => ({ ...current, [item.reportId]: "" }));
      await loadRef.current();
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: item.reportId,
        error: isPilotApiError(nextError)
          ? nextError.message
          : "No pudimos resolver el reporte.",
      });
    } finally {
      if (finishAction(ticket)) {
        setActionState((current) =>
          current?.scopeKey === authScopeKey
            ? { ...current, busy: null }
            : current,
        );
      }
    }
  };

  if (forbidden) {
    return (
      <section className="pilot-page">
        <div className="pilot-error" role="alert">
          <h1>Operación del piloto</h1>
          <p>
            Tu cuenta está autenticada, pero el backend no habilitó permisos de
            operación del piloto.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="pilot-page" aria-labelledby="pilot-admin-title">
      <header className="pilot-hero">
        <div>
          <p className="pilot-eyebrow">Operación</p>
          <h1 id="pilot-admin-title">Pilot v1</h1>
          <p>
            Métricas operativas y moderación auditada. No es un panel de
            engagement ni un permiso definido por la UI.
          </p>
        </div>
        <label className="pilot-window-control">
          Ventana
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={30}>30 días</option>
            <option value={60}>60 días</option>
            <option value={90}>90 días</option>
          </select>
        </label>
      </header>

      {error && (
        <div className="pilot-error" role="alert">
          {error}
        </div>
      )}

      {metrics && (
        <>
          <div className="pilot-metric-grid">
            <article className="pilot-metric">
              <span>Onboarding completo</span>
              <strong>{percentage(metrics.onboarding.completionRate)}</strong>
              <small>
                {metrics.onboarding.profilesCompleted}/
                {metrics.onboarding.accountsCreated} cuentas de la ventana
              </small>
            </article>
            <article className="pilot-metric">
              <span>Búsquedas sin resultado</span>
              <strong>{percentage(metrics.search.noResultRate)}</strong>
              <small>
                {metrics.search.noResultSearches}/{metrics.search.searches}{" "}
                búsquedas
              </small>
            </article>
            <article className="pilot-metric">
              <span>Usuarios que vuelven</span>
              <strong>{percentage(metrics.activity.returningRate)}</strong>
              <small>
                {metrics.activity.returningUsers}/{metrics.activity.activeUsers}{" "}
                activos
              </small>
            </article>
            <article className="pilot-metric">
              <span>Contribución</span>
              <strong>
                {percentage(metrics.contributions.contributionRate)}
              </strong>
              <small>
                {metrics.contributions.contributors} contribuidores ·{" "}
                {metrics.contributions.events} aportes
              </small>
            </article>
            <article className="pilot-metric">
              <span>Reportes pendientes</span>
              <strong>{metrics.moderation.pending}</strong>
              <small>
                {metrics.moderation.reviewedInWindow} revisados en la ventana
              </small>
            </article>
          </div>

          <section className="pilot-card">
            <h2>Valor por etapa académica</h2>
            <p className="pilot-muted">
              Alumni no se mezcla con estudiantes activos: medimos actividad y
              retorno por etapa para no convertir DAU en el único criterio de
              éxito.
            </p>
            <div className="pilot-cohort-grid">
              <article>
                <span>Estudiantes activos</span>
                <strong>{metrics.audience.activeStudents.activeUsers}</strong>
                <small>
                  {metrics.audience.activeStudents.returningUsers} vuelven ·{" "}
                  {returningRate(
                    metrics.audience.activeStudents.activeUsers,
                    metrics.audience.activeStudents.returningUsers,
                  )}
                </small>
              </article>
              <article>
                <span>Alumni</span>
                <strong>{metrics.audience.alumni.activeUsers}</strong>
                <small>
                  {metrics.audience.alumni.returningUsers} vuelven ·{" "}
                  {returningRate(
                    metrics.audience.alumni.activeUsers,
                    metrics.audience.alumni.returningUsers,
                  )}
                </small>
              </article>
              <article>
                <span>Comunidad / otros</span>
                <strong>{metrics.audience.community.activeUsers}</strong>
                <small>
                  {metrics.audience.community.returningUsers} vuelven ·{" "}
                  {returningRate(
                    metrics.audience.community.activeUsers,
                    metrics.audience.community.returningUsers,
                  )}
                </small>
              </article>
            </div>
          </section>

          <section className="pilot-card">
            <h2>Densidad por materia</h2>
            {metrics.subjects.length === 0 ? (
              <p className="pilot-muted">
                Todavía no hay actividad académica suficiente para comparar
                materias.
              </p>
            ) : (
              <div className="pilot-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Materia</th>
                      <th>Estudiantes actuales</th>
                      <th>Recursos</th>
                      <th>Preguntas abiertas</th>
                      <th>Aportes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.subjects.map((subject) => (
                      <tr key={subject.subjectId}>
                        <td>{subject.subjectName ?? subject.subjectId}</td>
                        <td>{subject.currentParticipants}</td>
                        <td>{subject.resources}</td>
                        <td>{subject.openQuestions}</td>
                        <td>{subject.contributionEvents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {metrics.subjectsTruncated && (
              <p className="pilot-muted">
                Vista limitada a las 100 materias de mayor actividad.
              </p>
            )}
          </section>
        </>
      )}

      <section className="pilot-card">
        <div className="pilot-card-heading">
          <h2>Moderación pendiente</h2>
          <button
            type="button"
            className="secondary"
            onClick={() => void load()}
          >
            Actualizar
          </button>
        </div>

        {queue.length === 0 ? (
          <p className="pilot-muted">No hay reportes pendientes.</p>
        ) : (
          <div className="pilot-moderation-list">
            {queue.map((item) => (
              <article key={`${item.kind}:${item.reportId}`}>
                <header>
                  <div>
                    <span>
                      {item.targetKind} · {item.reason}
                    </span>
                    <h3>{item.target.title}</h3>
                  </div>
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString("es-AR")}
                  </time>
                </header>
                {item.target.preview && <p>{item.target.preview}</p>}
                {item.details && (
                  <p>
                    <strong>Detalle del reporte:</strong> {item.details}
                  </p>
                )}
                <label>
                  Motivo de revisión
                  <textarea
                    rows={2}
                    value={reason[item.reportId] ?? ""}
                    onChange={(event) =>
                      setReason((current) => ({
                        ...current,
                        [item.reportId]: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="pilot-actions">
                  <button
                    type="button"
                    disabled={busy === item.reportId}
                    onClick={() => void review(item, "hide")}
                  >
                    Ocultar
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy === item.reportId}
                    onClick={() => void review(item, "restore")}
                  >
                    Restaurar
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy === item.reportId}
                    onClick={() => void review(item, "dismiss")}
                  >
                    Desestimar reporte
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
};

export default AdminPilot;
