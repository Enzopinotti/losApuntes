import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import {
  createWebReleaseManifest,
  type WebReleaseManifest,
} from "./release-manifest";

function releaseManifestPlugin(manifest: WebReleaseManifest): Plugin {
  return {
    name: "losapuntes-release-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "release.json",
        source: `${JSON.stringify(manifest)}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const releaseManifest = createWebReleaseManifest({
    releaseId: env.VITE_RELEASE_ID,
    sourceSha: env.VITE_RELEASE_SHA,
    apiOrigin: env.VITE_API_BASE_URL,
  });

  return {
    plugins: [react(), releaseManifestPlugin(releaseManifest)],
  };
});
