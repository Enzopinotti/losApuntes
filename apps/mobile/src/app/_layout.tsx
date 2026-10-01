import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";

import { AcademicContextProvider } from "@/features/academic/academic-context-provider";
import { SessionProvider } from "@/features/session/session-provider";

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SessionProvider>
        <AcademicContextProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </AcademicContextProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
