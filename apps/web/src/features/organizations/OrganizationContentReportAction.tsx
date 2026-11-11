import { useEffect, useMemo, useState } from "react";

import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";
import {
  OrganizationReportController,
  type OrganizationReportTargetType,
} from "./organization-report-controller";
import {
  ORGANIZATION_REPORT_DETAILS_MAX_LENGTH,
  ORGANIZATION_REPORT_REASONS,
  validateOrganizationReport,
  type OrganizationReportReason,
} from "./organization-report-policy";
import {
  isOrganizationsApiError,
  organizationsApi,
} from "./services/organizationsService";

function targetLabel(targetType: OrganizationReportTargetType): string {
  return targetType === "post" ? "publicación" : "evento";
}

function failureMessage(error: unknown): string {
  if (isOrganizationsApiError(error)) {
    return `No pudimos enviar el reporte. ${error.message}`;
  }
  return "No pudimos enviar el reporte. Podés corregirlo o intentar de nuevo.";
}

export function OrganizationContentReportAction({
  scopeKey,
  organizationId,
  targetType,
  targetId,
}: {
  scopeKey: string;
  organizationId: string;
  targetType: OrganizationReportTargetType;
  targetId: string;
}) {
  const label = targetLabel(targetType);
  const controller = useMemo(
    () => new OrganizationReportController(organizationsApi),
    [],
  );
  const operationScope = `${scopeKey}:${targetType}:${targetId}`;
  const { begin, isCurrent, finish } = useAsyncAuthorityFence(operationScope);
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState<OrganizationReportReason | "">("");
  const [details, setDetails] = useState("");

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => {
    controller.setTarget(scopeKey, organizationId, targetType, targetId);
    return () => controller.invalidate(scopeKey);
  }, [controller, organizationId, scopeKey, targetId, targetType]);

  const current =
    snapshot.kind === "ready" &&
    snapshot.scopeKey === scopeKey &&
    snapshot.organizationId === organizationId &&
    snapshot.targetType === targetType &&
    snapshot.targetId === targetId
      ? snapshot
      : null;
  const validation = validateOrganizationReport(reason || null, details);

  const submit = async () => {
    if (validation.kind !== "valid" || current?.sending) return;
    const ticket = begin();
    if (!isCurrent(ticket)) return;

    try {
      await controller.submit(
        scopeKey,
        organizationId,
        targetType,
        targetId,
        validation.input.reason,
        validation.input.details ?? "",
      );
    } finally {
      finish(ticket);
    }
  };

  if (current?.outcome === "confirmed") {
    return (
      <div className="organization-report-status" role="status">
        Recibimos el reporte. Quedó pendiente de revisión.
      </div>
    );
  }

  if (current?.outcome === "uncertain") {
    return (
      <div
        className="organization-report-status organizations-error"
        role="alert"
      >
        No pudimos confirmar si el reporte se registró. No lo vuelvas a enviar;
        el servidor podría haberlo recibido.
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="secondary"
        onClick={() => setExpanded(true)}
      >
        Reportar {label}
      </button>
    );
  }

  return (
    <div className="organization-report-form">
      <label>
        Motivo del reporte
        <select
          disabled={current?.sending ?? false}
          onChange={(event) =>
            setReason(event.target.value as OrganizationReportReason | "")
          }
          required
          value={reason}
        >
          <option value="">Elegí un motivo</option>
          {ORGANIZATION_REPORT_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Detalles opcionales
        <textarea
          disabled={current?.sending ?? false}
          maxLength={ORGANIZATION_REPORT_DETAILS_MAX_LENGTH}
          onChange={(event) => setDetails(event.target.value)}
          rows={3}
          value={details}
        />
      </label>
      <small>{details.length}/1500 caracteres</small>
      {validation.kind === "invalid" && reason ? (
        <p className="organizations-error" role="alert">
          {validation.message}
        </p>
      ) : null}
      {current?.failure ? (
        <p className="organizations-error" role="alert">
          {failureMessage(current.failure)}
        </p>
      ) : null}
      {current?.sending ? <p role="status">Enviando reporte…</p> : null}
      <div className="organization-report-actions">
        <button
          type="button"
          disabled={validation.kind !== "valid" || (current?.sending ?? false)}
          onClick={() => void submit()}
        >
          {current?.failure ? "Reintentar envío" : "Enviar reporte"}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={current?.sending ?? false}
          onClick={() => setExpanded(false)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
