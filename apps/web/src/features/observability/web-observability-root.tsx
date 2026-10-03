import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";

import {
  installWebGlobalDiagnosticHandlers,
  reportWebDiagnostic,
  type WebDiagnosticContext,
} from "./web-diagnostics";
import { WebErrorBoundary } from "./web-error-boundary";

function runtimeDiagnosticContext(): WebDiagnosticContext {
  return {
    appVersion: import.meta.env.VITE_APP_VERSION ?? null,
    build: import.meta.env.VITE_BUILD_ID ?? null,
    revision: import.meta.env.VITE_RELEASE_SHA ?? null,
    surface: window.location.pathname || "/",
  };
}

export function WebObservabilityRoot({ children }: { children: ReactNode }) {
  const report = useCallback((error: unknown) => {
    reportWebDiagnostic(error, runtimeDiagnosticContext());
  }, []);

  useEffect(
    () => installWebGlobalDiagnosticHandlers(window, report),
    [report],
  );

  return <WebErrorBoundary onError={report}>{children}</WebErrorBoundary>;
}
