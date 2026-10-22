import { useState } from "react";

import { publicProfileShareUrl } from "./public-profile-share-link";

export function PublicProfileShareAction({
  profileId,
  displayName,
}: {
  profileId: string;
  displayName: string;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const share = async () => {
    const url = publicProfileShareUrl(profileId, window.location.origin);
    if (!url) {
      setFailed(true);
      setStatus("No pudimos preparar el enlace público de este perfil.");
      return;
    }

    setPending(true);
    setFailed(false);
    setStatus(null);
    setManualUrl(null);

    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: displayName, url });
          setStatus("Perfil listo para compartir.");
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
        }
      }

      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error("Clipboard API is unavailable");
        }
        await navigator.clipboard.writeText(url);
        setStatus("Enlace del perfil copiado.");
      } catch {
        setFailed(true);
        setManualUrl(url);
        setStatus(
          "No pudimos copiarlo. Seleccioná el enlace para compartirlo.",
        );
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="public-profile-share-action">
      <button
        className="secondary"
        disabled={pending}
        onClick={() => void share()}
        type="button"
      >
        {pending ? "Preparando enlace…" : "Compartir perfil"}
      </button>
      {status ? <p role={failed ? "alert" : "status"}>{status}</p> : null}
      {manualUrl ? (
        <label>
          Enlace público
          <input
            aria-label="Enlace público del perfil"
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
