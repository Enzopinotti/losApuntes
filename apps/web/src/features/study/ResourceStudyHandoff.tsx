import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  isResourcesApiError,
  resourcesApi,
} from "../resources/services/resourcesService";
import {
  isSearchApiError,
  searchApi,
} from "../search/services/searchService";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";
import { resourceToStudyHandoffPlan } from "./resource-study-handoff.mjs";
import { createStudyHandoff } from "./study-session-handoff.mjs";

type Feedback = {
  scope: string;
  busy: boolean;
  error: string | null;
};

type Props = {
  resourceId: string;
  authorityScope: string;
};

function messageFor(error: unknown): string {
  if (isResourcesApiError(error) || isSearchApiError(error)) {
    if (error.status === 401) {
      return "Tu sesión venció. Volvé a iniciar sesión.";
    }
    if (error.status === 403 || error.status === 404) {
      return "Este apunte o tu materia dejaron de estar disponibles.";
    }
  }
  return "No pudimos verificar el apunte y tu materia. Revisá la conexión y reintentá.";
}

export function ResourceStudyHandoff({
  resourceId,
  authorityScope,
}: Props) {
  const navigate = useNavigate();
  const scope = `resource-study-handoff:${authorityScope}:${resourceId}`;
  const { begin, isCurrent, finish } = useAsyncAuthorityFence(scope);
  const pending = useRef(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const current = feedback?.scope === scope ? feedback : null;

  const prepare = async () => {
    if (pending.current) return;
    const ticket = begin();
    if (!isCurrent(ticket)) return;
    pending.current = true;
    setFeedback({ scope, busy: true, error: null });

    try {
      // Neither a public detail page nor a resource UUID proves that the
      // signed-in student currently studies the associated subject.
      const [resourceResponse, contextual] = await Promise.all([
        resourcesApi.get(resourceId, ticket.signal),
        searchApi.contextual(
          { subjectLimit: 8, resourcesPerSubject: 1 },
          ticket.signal,
        ),
      ]);
      if (!isCurrent(ticket)) return;
      const plan = resourceToStudyHandoffPlan(
        resourceResponse.resource,
        contextual,
        resourceId,
      );
      if (!plan) {
        setFeedback({
          scope,
          busy: false,
          error:
            "Este apunte no pertenece a una de tus primeras ocho materias actuales. Elegí una materia desde la Mesa de estudio.",
        });
        return;
      }

      // Scope format matches StudySession exactly. The route only receives an
      // opaque, expiring nonce; StudySession re-authorizes on import.
      const handoff = createStudyHandoff(
        plan,
        `${authorityScope}:${plan.subjectId}`,
      );
      if (!isCurrent(ticket)) return;
      navigate(
        `/study/session?subjectId=${encodeURIComponent(plan.subjectId)}`,
        { state: handoff },
      );
    } catch (error) {
      if (!isCurrent(ticket)) return;
      setFeedback({ scope, busy: false, error: messageFor(error) });
    } finally {
      pending.current = false;
      finish(ticket);
    }
  };

  return (
    <div className="resource-study-handoff">
      <button
        type="button"
        className="secondary"
        disabled={current?.busy ?? false}
        onClick={() => void prepare()}
      >
        {current?.busy ? "Verificando materia…" : "Preparar sesión con este apunte"}
      </button>
      {current?.error && <p role="alert">{current.error}</p>}
    </div>
  );
}
