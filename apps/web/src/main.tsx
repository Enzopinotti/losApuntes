import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { WebObservabilityRoot } from "./features/observability/web-observability-root";
import App from "./app/App";
import "./shared/styles/_index.scss";

createRoot(document.getElementById("root")!).render(
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
