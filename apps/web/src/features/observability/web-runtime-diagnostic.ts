import { reportWebDiagnostic } from "./web-diagnostics";

export function reportWebRuntimeDiagnostic(error: unknown): void {
  reportWebDiagnostic(error, {
    appVersion: import.meta.env.VITE_APP_VERSION ?? null,
    build: import.meta.env.VITE_BUILD_ID ?? null,
    revision: import.meta.env.VITE_RELEASE_SHA ?? null,
    surface: window.location.pathname || "/",
  });
}
