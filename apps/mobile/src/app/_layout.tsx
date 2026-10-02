import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";

import { AcademicContextProvider } from "@/features/academic/academic-context-provider";
import { MobileObservabilityRoot } from "@/features/observability/mobile-observability-root";
import { SessionProvider } from "@/features/session/session-provider";

export default function RootLayout() {
  return (
    <MobileObservabilityRoot>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SessionProvider>
          <AcademicContextProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </AcademicContextProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </MobileObservabilityRoot>
  );
}
