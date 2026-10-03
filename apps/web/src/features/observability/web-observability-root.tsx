import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";

import { installWebGlobalDiagnosticHandlers } from "./web-diagnostics";
import { WebErrorBoundary } from "./web-error-boundary";
import { reportWebRuntimeDiagnostic } from "./web-runtime-diagnostic";

export function WebObservabilityRoot({ children }: { children: ReactNode }) {
  const report = useCallback(reportWebRuntimeDiagnostic, []);

  useEffect(() => installWebGlobalDiagnosticHandlers(window, report), [report]);

  return <WebErrorBoundary onError={report}>{children}</WebErrorBoundary>;
}
