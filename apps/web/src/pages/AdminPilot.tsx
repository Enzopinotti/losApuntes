import { useCallback, useEffect, useState } from "react";
import type {
  PilotMetricsResponse,
  PilotModerationAction,
  PilotModerationItem,
} from "../features/pilot/interfaces";
import {
  isPilotApiError,
  pilotApi,
} from "../features/pilot/services/pilotService";
import "./Pilot.scss";

function percentage(value: number): string {
  return `${value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
  })}%`;
}

const AdminPilot = () => {
  const [metrics, setMetrics] = useState<PilotMetricsResponse | null>(null);
  const [queue, setQueue] = useState<PilotModerationItem[]>([]);
  const [days, setDays] = useState(14);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setForbidden(false);

    try {
      const [metricsResult, queueResult] = await Promise.all([
        pilotApi.metrics(days),
        pilotApi.moderation("pending", 50),
      ]);
      setMetrics(metricsResult);
      setQueue(queueResult.items);
    } catch (nextError) {
      if (isPilotApiError(nextError) && nextError.status === 403) {
        setForbidden(true);
        setMetrics(null);
        setQueue([]);
        return;
      }
      setError(
        isPilotApiError(nextError)
          ? nextError.message
          : "No pudimos cargar la operación del piloto.",
      );
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (
    item: PilotModerationItem,
    action: PilotModerationAction,
  ) => {
    const reviewReason = reason[item.reportId]?.trim() ?? "";
    if (reviewReason.length < 3) {
      setError("Ingresá un motivo de revisión de al menos 3 caracteres.");
      return;
    }

    setBusy(item.reportId);
    setError(null);

    try {
      await pilotApi.review(item.kind, item.reportId, action, reviewReason);
      setReason((current) => ({ ...current, [item.reportId]: "" }));
      await load();
    } catch (nextError) {
      setError(
        isPilotApiError(nextError)
          ? nextError.message
          : "No pudimos resolver el reporte.",
      );
    } finally {
      setBusy(null);
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
                {metrics.activity.returningUsers}/
                {metrics.activity.activeUsers} activos
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
          <button type="button" className="secondary" onClick={() => void load()}>
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
