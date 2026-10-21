import { useState } from "react";

import type { ResourceView } from "../features/resources/interfaces";
import { buildResourceCitation } from "../features/resources/resource-citation.mjs";
import "./ResourceCitation.scss";

type Props = {
  resource: ResourceView;
};

/** No back-end request, link publication or automatic clipboard write. */
export default function ResourceCitation({ resource }: Props) {
  const [feedback, setFeedback] = useState<"copied" | "manual" | null>(null);
  const [expanded, setExpanded] = useState(false);

  let citation: ReturnType<typeof buildResourceCitation> | null = null;
  try {
    citation = buildResourceCitation(resource, window.location.origin);
  } catch {
    // Do not manufacture or copy malformed / unverified resource data.
    return null;
  }

  const copy = async () => {
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(citation.text);
      setFeedback("copied");
    } catch {
      setFeedback("manual");
    }
  };

  return (
    <div className="resource-citation" data-resource-citation={resource.id}>
      <button
        type="button"
        className="resource-citation-toggle"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((current) => !current);
          setFeedback(null);
        }}
      >
        {expanded ? "Ocultar referencia" : "Preparar referencia"}
      </button>

      {expanded && (
        <section
          className="resource-citation-preview"
          aria-label="Referencia académica de este apunte"
        >
          <p className="resource-citation-notice">
            Referencia sencilla, no verificada ni equivalente a una cita APA
            certificada. Revisá la autoría antes de usarla en un trabajo.
          </p>
          {!citation.publicLinkIncluded && (
            <p className="resource-citation-private">
              El apunte no es público. La referencia no incluye un enlace y no
              cambia quién tiene permiso para accederlo.
            </p>
          )}
          {citation.publicLinkIncluded && (
            <p className="resource-citation-public">
              Se incluye un enlace público del sitio. Su acceso se comprueba
              cuando otra persona lo abre.
            </p>
          )}
          <label className="resource-citation-label">
            Texto para revisar o copiar
            <textarea
              value={citation.text}
              readOnly
              rows={4}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <button type="button" className="resource-citation-copy" onClick={() => void copy()}>
            Copiar referencia
          </button>
          {feedback === "copied" && (
            <p role="status">Referencia copiada. Revisala antes de citar.</p>
          )}
          {feedback === "manual" && (
            <p role="alert">
              No pudimos copiar automáticamente. Seleccioná el texto anterior
              y copialo manualmente.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
