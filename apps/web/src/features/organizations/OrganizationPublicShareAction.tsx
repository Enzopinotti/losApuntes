import { useState } from "react";

import { organizationPublicPath } from "./organization-public-share.mjs";

export function OrganizationPublicShareAction({
  organizationId,
  displayName,
}: {
  organizationId: string;
  displayName: string;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const path = organizationPublicPath(organizationId);

  if (!path) return null;

  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    setPending(true);
    setMessage(null);
    setFailed(false);
    setManualUrl(null);

    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: displayName,
            text: `Conocé ${displayName} en Los Apuntes.`,
            url,
          });
          setMessage("Enlace de la organización compartido.");
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
        }
      }

      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error("Clipboard unavailable");
        }
        await navigator.clipboard.writeText(url);
        setMessage("Enlace de la organización copiado.");
      } catch {
        setFailed(true);
        setManualUrl(url);
        setMessage("No pudimos copiarlo. Seleccioná el enlace público.");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="organization-share-action">
      <button
        type="button"
        disabled={pending}
        onClick={() => void share()}
      >
        {pending ? "Preparando enlace…" : "Compartir organización"}
      </button>
      {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
      {manualUrl ? (
        <label className="organization-share-fallback">
          Enlace público
          <input
            aria-label="Enlace público de la organización"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            type="url"
            value={manualUrl}
          />
        </label>
      ) : null}
    </div>
  );
}
