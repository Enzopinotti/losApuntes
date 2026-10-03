import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { reportWebRuntimeDiagnostic } from "./features/observability/web-runtime-diagnostic";
import { WebObservabilityRoot } from "./features/observability/web-observability-root";
import App from "./app/App";
import "./shared/styles/_index.scss";

const root = createRoot(document.getElementById("root")!, {
  onCaughtError: () => {
    // WebErrorBoundary reports caught errors using its privacy-safe envelope.
  },
  onRecoverableError: reportWebRuntimeDiagnostic,
  onUncaughtError: reportWebRuntimeDiagnostic,
});

root.render(
  <StrictMode>
    <WebObservabilityRoot>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </WebObservabilityRoot>
  </StrictMode>,
);
