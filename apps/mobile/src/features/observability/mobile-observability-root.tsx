import Constants from "expo-constants";
import { usePathname } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";

import {
  type MobileDiagnosticContext,
  type MobileErrorUtils,
  installMobileGlobalErrorHandler,
  reportMobileDiagnostic,
} from "./mobile-diagnostics";
import { MobileErrorBoundary } from "./mobile-error-boundary";

type GlobalWithErrorUtils = typeof globalThis & {
  ErrorUtils?: MobileErrorUtils;
};

function mobileBuildIdentifier(): string | null {
  if (Platform.OS === "ios") {
    return Constants.expoConfig?.ios?.buildNumber ?? null;
  }
  if (Platform.OS === "android") {
    const versionCode = Constants.expoConfig?.android?.versionCode;
    return versionCode === undefined ? null : String(versionCode);
  }
  return null;
}

function runtimeDiagnosticContext(surface: string): MobileDiagnosticContext {
  return {
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? null,
    build: mobileBuildIdentifier(),
    revision: process.env.EXPO_PUBLIC_RELEASE_SHA ?? null,
    surface,
  };
}

export function MobileObservabilityRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const context = useMemo(
    () => runtimeDiagnosticContext(pathname || "/"),
    [pathname],
  );
  const contextRef = useRef(context);
  contextRef.current = context;

  const report = useCallback((error: unknown) => {
    reportMobileDiagnostic(error, contextRef.current);
  }, []);

  useEffect(() => {
    const errorUtils = (globalThis as GlobalWithErrorUtils).ErrorUtils;
    return installMobileGlobalErrorHandler(errorUtils, report);
  }, [report]);

  return <MobileErrorBoundary onError={report}>{children}</MobileErrorBoundary>;
}
